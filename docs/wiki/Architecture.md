# Architecture

How the system is put together: its context, the containers that run it, the monorepo, the main
request flows, and exactly what data leaves for third parties. Read this before changing anything
that crosses a boundary.

## System context

```mermaid
flowchart TB
  users(["Legal and finance users<br/>(browser)"])
  subgraph app [Contract Analyzer]
    direction TB
    system[Web app + API + PostgreSQL]
  end
  idp["Identity provider<br/>(Entra ID, Google, OIDC)"]
  voyage["Voyage AI<br/>(embeddings)"]
  anthropic["Anthropic<br/>(Claude)"]
  observe["NestJS Observe<br/>(optional telemetry)"]
  users -->|HTTPS| system
  system <-->|OIDC sign-in| idp
  system -->|chunk and question text| voyage
  system -->|excerpts, question, filename| anthropic
  system -.->|ids, counts, timings| observe
```

## Containers

```mermaid
flowchart LR
  browser([Browser]) -->|":3000"| web
  subgraph local [Local machine: pnpm dev or docker compose]
    web["web: Next.js 16<br/>pages, Better Auth,<br/>/api/backend proxy"]
    api["api: NestJS 12 on Fastify<br/>documents, analysis,<br/>audit, health"]
    migrate[["migrate (one-off)"]]
  end
  web -->|"HTTP + bearer JWT"| api
  api -->|"JWKS (cached)"| web
  web --> db[(PostgreSQL 17<br/>pgvector)]
  api --> db
  migrate --> db
```

- **web** serves every page, owns sign-in and sessions (Better Auth), and is the only thing browsers
  talk to. Its `/api/backend/*` route handler forwards allowlisted calls to the API with a 5-minute
  JWT. Its `/api/auth/*` routes are Better Auth's.
- **api** does the work: PDF ingestion, retrieval, calls to Voyage and Claude, the audit log. It
  trusts nothing from the browser: every request carries a JWT it verifies against the web app's
  JWKS, and it reads the caller's role from the database.
- **PostgreSQL with pgvector** holds both apps' data in one schema owned by `@repo/db`, in a
  container locally and in CI.

This is a learning project: it runs locally and in CI only, and has no production deployment.

## Monorepo

```
apps/api            NestJS API (port 3001)
apps/web            Next.js app (port 3000)
packages/contracts  @repo/contracts: zod schemas, types, error codes, permissions, constants
packages/db         @repo/db: Drizzle schema (app + Better Auth tables), migrations, migrate script
docs/wiki/          this wiki
scripts/            repository settings and wiki tooling
```

pnpm workspaces and Turborepo run the tasks; both shared packages are compiled to ESM with type
declarations, because the Nest build can't compile TypeScript from another package. See
[Development workflow](Development-Workflow#root-scripts).

## Shared contracts

`@repo/contracts` is the single definition of the HTTP contract: request and response schemas,
`ERROR_CODES`, the role-permission matrix, audit actions and constants such as the "not found"
sentences. The API validates requests and serializes responses with these schemas (NestJS 12's
Standard Schema support), and the web app reuses them for forms, response validation and
permission-aware UI, so the two sides can't drift. See [API reference](API-Reference).

## Request flows

### Upload

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant W as Web (proxy)
  participant A as API
  participant DB as PostgreSQL
  participant V as Voyage AI
  B->>W: POST /api/backend/documents/upload (multipart, session cookie)
  W->>W: same-origin check, session, mint JWT
  W->>A: POST /documents/upload (stream, Authorization: Bearer)
  A->>A: verify JWT, load role, check document:upload, rate limit
  A->>A: check mimetype and %PDF- magic bytes
  A->>DB: insert document (processing) + audit event, one transaction
  A->>A: extract text per page, chunk, map chunks to pages
  A->>V: embed chunks (input_type document, batches of 64)
  A->>DB: insert chunks + mark ready, one transaction
  A-->>W: 201 Document
  W-->>B: 201 Document (x-request-id)
```

A scanned PDF stops after extraction (422, document `failed`); a provider failure marks the
document `failed` and returns 502. Details on [RAG pipeline](RAG-Pipeline).

### Ask

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant W as Web (proxy)
  participant A as API
  participant DB as PostgreSQL
  participant V as Voyage AI
  participant C as Claude
  B->>W: POST /api/backend/analysis/ask
  W->>A: POST /analysis/ask (Bearer JWT, x-request-id)
  A->>DB: resolve document in the caller's organization (404 / 409)
  A->>V: embed question (input_type query)
  A->>DB: top-k chunks of this document by cosine distance
  A->>C: system prompt + excerpts + question
  C-->>A: answer with citations
  A->>DB: audit event (counts and timings only)
  A-->>B: answer, truncated, sources
```

### Compare

Like ask, with two documents: both are resolved first (any missing one is 404), the query is
embedded **once**, both documents are searched **in parallel**, each side gains the counterparts
of the other side's hits (see [RAG pipeline](RAG-Pipeline#comparison)), and Claude gets the
excerpts as `<contract_A>` and `<contract_B>`.

## The route handler proxy

The browser never calls the API. `apps/web/app/api/backend/[...path]/route.ts`:

1. rejects cross-site requests (`Sec-Fetch-Site`, or a foreign `Origin` on non-GET requests);
2. allows only the `documents`, `analysis` and `audit-events` prefixes;
3. requires a session with an active organization;
4. mints a 5-minute JWT and forwards the request with it, streaming the body, without cookies;
5. returns the API's status, body and safe headers, with the request id.

So the API needs no CORS for its own frontend, never sees a cookie, and can stay off the internet.
See [Frontend](Frontend#the-backend-proxy) and [Security](Security#trust-boundaries).

## Data boundaries

Exactly what leaves the application:

| Recipient                            | What is sent                                                                                                                                                                                                                                                                                      | What is not                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Voyage AI**                        | The text of every chunk at upload; each question or comparison query.                                                                                                                                                                                                                             | Filenames, user or organization data.                                                    |
| **Anthropic**                        | The system prompt, the retrieved excerpts (up to `RAG_TOP_K` per document), the question or query, and the document filename(s).                                                                                                                                                                  | Other excerpts, user or organization data. Trace ids aren't propagated.                  |
| **NestJS Observe** (when configured) | Traces with route templates, status codes, durations, opaque user and organization ids, request ids; SQL statements without literals; custom spans and metrics (ids, counts, model names, timings); stack traces and nearby source lines of server errors, scrubbed of keys and query parameters. | Request or response bodies, document text, filenames, questions, answers, emails, names. |
| **Identity provider**                | The standard OIDC sign-in exchange.                                                                                                                                                                                                                                                               |                                                                                          |

Logs follow the same rule as telemetry: ids, counts, model names and durations only. The full
policy is on [Security](Security#data-handling).

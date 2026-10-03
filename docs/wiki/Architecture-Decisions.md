# Architecture decisions

The log of significant architecture decisions: for each, the context, what was decided and the
consequences we accepted. Read it before revisiting a decision, and add an entry (in the same pull
request) when you make a new one. Entries are accepted unless marked otherwise.

## Exact search instead of HNSW

- **Context.** Every question searches the chunks of exactly one document (two for comparisons).
  pgvector's HNSW index is approximate, and combined with a `WHERE document_id = …` filter it can
  return fewer than k rows when the filter removes most candidates.
- **Decision.** No vector index. Search scans the document's chunks through the `document_id`
  B-tree index, computing every cosine distance, ordered by distance with `LIMIT k`.
- **Consequences.** Always k rows (or every chunk of a small document), deterministic results, and
  fast enough at contract sizes (a few thousand chunks). Cross-document search would need HNSW with
  `vector_cosine_ops` and `hnsw.iterative_scan`. See [RAG pipeline](RAG-Pipeline).

## The `pg` driver

- **Context.** Drizzle supports node-postgres and postgres.js; NestJS Observe instruments database
  queries at the driver level and detects `pg`.
- **Decision.** node-postgres (`pg`) everywhere: the API (through `@nestjs/drizzle`), the web app
  (Better Auth's adapter and audit writes) and the migrate script.
- **Consequences.** Query spans in Observe out of the box; one driver to configure and pool.

## voyage-law-2 embeddings

- **Context.** Retrieval quality on legal language decides answer quality.
- **Decision.** Voyage AI `voyage-law-2` (1024 dimensions), with `document` and `query` input types,
  behind an `EmbeddingProvider` interface.
- **Consequences.** Better recall on contract language than general-purpose models; a second AI
  provider receives chunk text (see [Architecture](Architecture#data-boundaries)); a replacement
  model must also produce 1024 dimensions or the column and every embedding must change.

## Anthropic SDK instead of LangChain

- **Context.** The pipeline is one embedding call, one SQL query and one model call per question.
- **Decision.** Call Claude with `@anthropic-ai/sdk` and Voyage over REST directly. LangChain is used
  only for its text splitter.
- **Consequences.** Full control over prompts, timeouts, retries, token limits and refusal handling,
  and fewer dependencies; no framework abstractions to swap models, which we don't need.

## The route handler proxy

- **Context.** Browsers need the API, but exposing it means CORS, cookie or token handling in the
  browser, and a larger attack surface.
- **Decision.** Browsers call only the web app; `/api/backend/*` forwards allowlisted calls to the
  API server-to-server with a freshly minted token. Not `rewrites` or `proxy.ts`: a route handler
  can check the session and mint the token.
- **Consequences.** The API stays internal, needs no CORS and never sees cookies; one extra hop;
  uploads are streamed through the web server.

## Shared zod contracts with Standard Schema

- **Context.** The API and the web app must agree on every request, response and error.
- **Decision.** One package, `@repo/contracts`, holds zod schemas and constants. The API validates
  and serializes with them through NestJS 12's Standard Schema support (no class-validator); the web
  app reuses them for forms and response validation.
- **Consequences.** Drift between the two apps fails at compile time or in tests; the package must
  be built before dependents (Turborepo handles it).

## NestJS Observe instead of OpenTelemetry

- **Context.** We need traces, errors and metrics for a NestJS API with little setup.
- **Decision.** `@nestjs/observe`: automatic controller, provider, database and outbound HTTP spans,
  plus a few custom spans and metrics, enabled only when credentials are set.
- **Consequences.** Little instrumentation code and no collector to run; telemetry goes to one
  vendor, with redaction and strict rules on what may be sent (see [Observability](Observability)).

## Oxc instead of ESLint, Prettier and Biome

- **Context.** Linting and formatting a TypeScript monorepo with ESLint and Prettier is slow and
  needs many plugins; type-aware rules are the most valuable and the slowest.
- **Decision.** oxlint with type-aware rules (oxlint-tsgolint) and oxfmt, one config each at the
  root. `tsc` on TypeScript 6 stays the source of truth for type errors.
- **Consequences.** An order of magnitude faster checks and hooks; oxfmt is still 0.x, so it is
  pinned exactly; a few rules are tuned for NestJS (see [Code quality](Code-Quality)).

## No production deployment

- **Context.** This is a learning project. Running a public instance means real identity provider
  setup, secrets management, backups and on-call duty for data nobody needs to store.
- **Decision.** The app runs locally (`pnpm dev`, or the Compose stack) and in CI only. CI still
  builds the Docker images and smoke-tests the containerized stack, so the app stays deployable;
  nothing publishes images or deploys them.
- **Consequences.** No TLS proxy, managed database, environment secrets or deploy workflows to
  maintain. Production concerns (security headers at the edge, backups, a real identity provider,
  shared rate-limit storage for several API instances) would have to be added before going live.

## The 7-day dependency cooldown

- **Context.** Hijacked npm packages are usually detected and pulled within days of publishing.
- **Decision.** pnpm installs only versions at least 7 days old (`minimumReleaseAge`), and
  Dependabot waits as long before proposing version updates. Security updates are immediate, with
  a documented exception procedure.
- **Consequences.** New releases arrive a week late; urgent fixes need a temporary exclusion (see
  [Dependencies](Dependencies#urgent-security-fixes)).

## CORS off by default, with an exact allowlist and an origin guard

- **Context.** The web app needs no CORS (it calls the API server-to-server), and CORS doesn't stop a
  browser from sending a request, only from reading the response.
- **Decision.** CORS is disabled unless `CORS_ORIGINS` lists exact origins; an origin guard rejects
  every request (preflight or not) whose `Origin` isn't allowed with 403 `ORIGIN_NOT_ALLOWED`.
- **Consequences.** Cross-site form posts and uploads can't reach the API; partner apps would need an
  explicit allowlist entry and a publicly reachable API.

## Rebase merges with Conventional Commits

- **Context.** The history should explain how and why the system changed, commit by commit.
- **Decision.** Conventional Commits with explanatory bodies, enforced by commitlint locally and in
  CI; rebase merges only, of branches that are up to date with `main` and green, so reviewed
  commits land on `main` unchanged and
  history stays linear; release notes are generated from commits.
- **Consequences.** Useful `git log`, `blame` and `bisect`; contributors must squash fixups and keep
  every commit green.

## Better Auth with SSO only

- **Context.** Firms already manage identities, MFA and conditional access in their identity
  provider; passwords would be one more credential store to protect.
- **Decision.** Better Auth in the web app, with Microsoft Entra ID, Google or any OIDC provider; no
  passwords, magic links or email. Sessions in PostgreSQL; organizations, roles and invitations
  through its organization plugin.
- **Consequences.** MFA and offboarding come from the identity provider; we depend on it being up;
  invitations are links shared by hand.

## Short-lived JWTs from the web app, verified by the API through JWKS

- **Context.** The API must authenticate each call without sharing the session store or a secret.
- **Decision.** The web app's proxy mints a 5-minute EdDSA JWT per call (`sub`, `sid`, `org`); the
  API verifies it against the web app's JWKS (cached, refetched on an unknown key). Keys rotate every
  90 days with a 30-day grace period.
- **Consequences.** No shared secrets; a stolen token is useful for at most 5 minutes; the API needs
  network access to the web app's JWKS.

## Roles loaded on every request

- **Context.** A token could carry the role, but then removing a member or downgrading a role would
  only apply when the token expires.
- **Decision.** Tokens carry no role; the API reads the caller's role from `member` on every
  request.
- **Consequences.** Membership changes apply immediately, at the cost of one indexed query per
  request.

## Organization-scoped data with 404 for cross-organization ids

- **Context.** Several firms share one instance; one must never see or detect another's documents.
- **Decision.** Every application row has an `organization_id`; every repository method requires it;
  a document from another organization is reported as 404, never 403.
- **Consequences.** Isolation is structural rather than a convention; integration tests check every
  endpoint against another organization's ids.

## Link-based invitations

- **Context.** There is no email infrastructure, and adding one would bring deliverability and
  phishing concerns.
- **Decision.** Inviting creates an invitation for an email and role; the inviter copies its link.
  Accepting requires signing in with that email; links expire after 7 days and can be revoked.
- **Consequences.** No outgoing email; inviters share links through their own channels.

## In-memory per-user rate limits

- **Context.** LLM and embedding calls are expensive; limits must be per user, since all browser
  traffic reaches the API from the web server's address.
- **Decision.** `@nestjs/throttler` keyed by user id after authentication, with in-memory storage:
  analysis 30 per minute, uploads 20 per hour by default.
- **Consequences.** Correct for the single API instance; running several instances requires shared
  storage (e.g. Redis), or each instance enforces its own budget.

# Testing

The test layers, how to run them, the Postgres integration database, the documentation drift tests,
and how to write new tests. Read this before adding a feature or when CI's test job fails.

## Layers

| Layer                 | Where                                                     | What it covers                                                                                                                                             |
| --------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract tests        | `packages/contracts/src/*.test.ts`                        | Schema validation and refinements, the permission matrix                                                                                                   |
| API unit tests        | `apps/api/src/**/*.test.ts`                               | Chunk-to-page mapping, prompt builders, the exception filter, telemetry no-op behavior, env validation                                                     |
| API HTTP tests        | `auth.test.ts`, `http-policy.test.ts`                     | Token verification and every cell of the permission matrix; CORS, the origin guard and request ids (Fastify `inject`)                                      |
| API integration tests | `app.integration.test.ts`, `vector-store.service.test.ts` | The real `AppModule` against PostgreSQL: ingestion of generated PDFs, tenant isolation, audit events, membership changes, rate limits, exact vector search |
| Web unit tests        | `apps/web/lib/**/*.test.ts`                               | Citation parsing, error mapping and redirects, the backend proxy's guards, permission helpers, `returnTo`, env validation                                  |
| Docs drift tests      | `docs-drift.test.ts` in each package                      | The wiki keeps up with the code (see below)                                                                                                                |
| Smoke test            | CI `docker` job                                           | The built images start together and answer correctly                                                                                                       |

Vitest everywhere. The API tests compile with SWC (`unplugin-swc`) because decorator metadata is
required for NestJS dependency injection.

## Running tests

```sh
pnpm test                                  # everything (integration suites skipped without a database)
pnpm turbo run test --filter=@repo/api     # one package
pnpm --filter @repo/web exec vitest        # watch mode in one package
```

## Integration tests

The API's integration suites run when `TEST_DATABASE_URL` is set and are skipped otherwise. A
global setup applies the migrations to that database first. `turbo.json` declares the variable in
the `test` task's `env`: Turborepo's strict env mode would otherwise hide it from the tests, and
runs with and without a database are cached separately. They need PostgreSQL with pgvector:

```sh
pnpm services:up
docker compose exec db psql -U postgres -c 'CREATE DATABASE api_test'
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/api_test pnpm turbo run test --filter=@repo/api
```

Each suite creates its own organizations and users with random ids and deletes them afterwards, so
suites can share the database and run in parallel. The outside world is replaced: test JWTs are
signed with a generated Ed25519 key served as a local JWKS, embeddings are deterministic
bag-of-words vectors, and Claude is a recording fake. PDFs are generated in memory. CI runs the
same suites against a `pgvector/pgvector:pg17` service container.

## Docs drift tests

These fail when the wiki falls behind the code:

| Package           | Checks that                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@repo/api`       | every key of the API env schema appears in `Configuration.md`, and every span and metric name in `telemetry-names.ts` appears in `Observability.md`                                                           |
| `@repo/web`       | every key of the web env schema appears in `Configuration.md`                                                                                                                                                 |
| `@repo/contracts` | every `ERROR_CODES` value appears in `API-Reference.md`; both "not found" sentences appear verbatim in `Prompt-Design.md`; every permission and audit action appears in `Authentication-and-Authorization.md` |

When one fails, document the new item on that page in the same pull request. Links and structure
are checked separately by `node scripts/wiki/validate.mjs` (CI's `docs` job).

## Writing tests

- Put tests next to the code: `name.test.ts`. Prefer pure functions for logic and test them
  directly.
- For endpoints, use the integration helpers in `apps/api/src/test/`: `createTestApp()` boots the real
  app, `seedOrganization()` and `addMember()` create data, `TestTokens` signs tokens, `buildPdf()` and
  `multipartFile()` build uploads.
- Every new endpoint needs tests for its permission (including the 404 for another organization's
  data) and its error codes.
- Never put real document text, keys or personal data in fixtures; use `example.com`.
- Mocks are typed (`vi.fn<(…) => …>()`); avoid conditional expectations.

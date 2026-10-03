# Configuration

Every setting of the API, the web app and the migrations, where each value comes from in
development and production, and which values are baked into images at build time. Read this when
setting up an environment or adding a variable.

All settings are environment variables, validated at startup with zod schemas
([API]({{repo}}/blob/main/apps/api/src/config/env.schema.ts),
[web]({{repo}}/blob/main/apps/web/lib/env.ts)). An invalid or missing required value stops the
process with a message naming the variable. **Empty values count as unset**, so `NAME=` in an env
file or Compose falls back to the default.

## Where values come from

| Context             | Source                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | `apps/api/.env` (read by Node's `--env-file`), `apps/web/.env` (read by Next.js), `packages/db/.env` (migrations). Copy each from its `.env.example`. |
| `docker compose up` | The same `.env` files, with hostnames overridden in `docker-compose.yml`.                                                                             |
| CI smoke test       | Dummy values in `docker-compose.ci.yml`.                                                                                                              |

`.gitignore` ignores every `.env*` file except `*.env.example`. Never commit real values.

## API (`apps/api`)

| Name                             | Required | Default             | Secret | Description                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------- | ------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                       | no       | `development`       | no     | `development`, `test` or `production`. Production enables JSON logs and requires `https` CORS origins.                                                                                                                                                                                                                                                                       |
| `PORT`                           | no       | `3001`              | no     | HTTP port. The API listens on `0.0.0.0`.                                                                                                                                                                                                                                                                                                                                     |
| `DATABASE_URL`                   | yes      |                     | yes    | PostgreSQL connection string (`postgres://...`). The database needs pgvector >= 0.8.                                                                                                                                                                                                                                                                                         |
| `ANTHROPIC_API_KEY`              | yes      |                     | yes    | Anthropic API key for answers and comparisons.                                                                                                                                                                                                                                                                                                                               |
| `ANTHROPIC_MODEL`                | no       | `claude-sonnet-5-5` | no     | Claude model. Server-side refusal fallbacks are enabled for models that support them.                                                                                                                                                                                                                                                                                        |
| `VOYAGE_API_KEY`                 | yes      |                     | yes    | Voyage AI API key for embeddings.                                                                                                                                                                                                                                                                                                                                            |
| `VOYAGE_MODEL`                   | no       | `voyage-law-2`      | no     | Embedding model. It must return 1024-dimension vectors (the column size).                                                                                                                                                                                                                                                                                                    |
| `RAG_TOP_K`                      | no       | `5`                 | no     | Excerpts retrieved per document (1–20). See [RAG pipeline](RAG-Pipeline#tuning).                                                                                                                                                                                                                                                                                             |
| `MAX_UPLOAD_MB`                  | no       | `25`                | no     | Maximum PDF size (1–100). Keep it equal to the web app's `NEXT_PUBLIC_MAX_UPLOAD_MB`.                                                                                                                                                                                                                                                                                        |
| `GIT_SHA`                        | no       |                     | no     | Commit the image was built from (a Docker build argument); NestJS Observe's service version.                                                                                                                                                                                                                                                                                 |
| `AUTH_JWKS_URL`                  | yes      |                     | no     | The web app's JWKS, used to verify bearer tokens, e.g. `http://web:3000/api/auth/jwks`.                                                                                                                                                                                                                                                                                      |
| `AUTH_ISSUER`                    | yes      |                     | no     | Expected token issuer: the web app's public origin (`APP_URL`), e.g. `https://contracts.example.com`.                                                                                                                                                                                                                                                                        |
| `AUTH_AUDIENCE`                  | no       | `legal-rag-api`     | no     | Expected token audience; must equal the web app's `AUTH_AUDIENCE`.                                                                                                                                                                                                                                                                                                           |
| `RATE_LIMIT_ANALYSIS_PER_MINUTE` | no       | `30`                | no     | Ask and compare requests per user per minute (shared budget).                                                                                                                                                                                                                                                                                                                |
| `RATE_LIMIT_UPLOADS_PER_HOUR`    | no       | `20`                | no     | Uploads per user per hour.                                                                                                                                                                                                                                                                                                                                                   |
| `CORS_ORIGINS`                   | no       | (CORS off)          | no     | Comma-separated exact origins of trusted browser apps that call the API directly, e.g. `https://partner.example.com`. Scheme, host and optional port only; `https` in production (`http://localhost:<port>` allowed in development). Only meaningful when a browser app outside this repository calls the API directly. See [API reference](API-Reference#cors-and-origins). |
| `OBSERVE_APP_KEY`                | no       |                     | yes    | NestJS Observe application key. Observe is enabled only when both key and secret are set.                                                                                                                                                                                                                                                                                    |
| `OBSERVE_APP_SECRET`             | no       |                     | yes    | NestJS Observe application secret.                                                                                                                                                                                                                                                                                                                                           |
| `OBSERVE_SERVICE_ID`             | no       | `legal-rag-api`     | no     | Service id shown in Observe.                                                                                                                                                                                                                                                                                                                                                 |
| `OBSERVE_ENDPOINT`               | no       | (hosted collector)  | no     | Base URL of a non-default Observe collector (self-hosted or local). Empty: the hosted collector.                                                                                                                                                                                                                                                                             |
| `OBSERVE_FORWARD_LOGS`           | no       | `false`             | no     | Forward logs to Observe (`true`/`false`; needs a paid plan).                                                                                                                                                                                                                                                                                                                 |
| `OBSERVE_TRACES_SAMPLE_RATE`     | no       | `1`                 | no     | Share of traces sent, 0–1.                                                                                                                                                                                                                                                                                                                                                   |

The API reads its environment when the process starts (Observe is decided at import time), so set
variables before starting it; `pnpm dev` passes `apps/api/.env` to Node with `--env-file`.
`ConfigService` returns only the schema's parsed values (`apps/api/src/config/app-config.module.ts`),
never raw `process.env`, which is what makes an empty variable behave as unset.

## Web app (`apps/web`)

| Name                           | Required             | Default         | Secret | Description                                                                                                                                                                         |
| ------------------------------ | -------------------- | --------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | no                   | `development`   | no     | `production` uses secure `__Secure-` cookies (the CI smoke test runs in this mode).                                                                                                 |
| `BACKEND_URL`                  | yes                  |                 | no     | The API's internal URL, used server-to-server by the proxy, e.g. `http://api:3001`. Never exposed to browsers.                                                                      |
| `NEXT_PUBLIC_MAX_UPLOAD_MB`    | no                   | `25`            | no     | Client-side upload size check. **Build time**: inlined into the browser bundle when the image is built.                                                                             |
| `DATABASE_URL`                 | yes                  |                 | yes    | The same PostgreSQL database as the API (sessions, organizations, audit events).                                                                                                    |
| `APP_URL`                      | yes                  |                 | no     | Public origin of the app, e.g. `https://contracts.example.com`. Base URL for sign-in callbacks, the only trusted origin, and the token issuer.                                      |
| `BETTER_AUTH_SECRET`           | yes                  |                 | yes    | At least 32 random bytes (`openssl rand -base64 48`). Signs sessions and encrypts the JWT signing keys. See [Troubleshooting](Troubleshooting#signing-keys-and-better_auth_secret). |
| `AUTH_AUDIENCE`                | no                   | `legal-rag-api` | no     | Audience of the API tokens; must equal the API's `AUTH_AUDIENCE`.                                                                                                                   |
| `AUTH_SESSION_TTL_HOURS`       | no                   | `12`            | no     | Session lifetime in hours (1–720). Sessions refresh hourly while used.                                                                                                              |
| `AUTH_ALLOWED_EMAIL_DOMAINS`   | no                   | (any)           | no     | Comma-separated email domains allowed to sign up and sign in, e.g. `example.com,example.org`.                                                                                       |
| `AUTH_ORG_CREATOR_EMAILS`      | no                   | (everyone)      | no     | Comma-separated emails allowed to create organizations. Empty: every user can.                                                                                                      |
| `AUTH_MICROSOFT_CLIENT_ID`     | with the other two   |                 | no     | Microsoft Entra ID application (client) id.                                                                                                                                         |
| `AUTH_MICROSOFT_CLIENT_SECRET` | with the other two   |                 | yes    | Microsoft Entra ID client secret.                                                                                                                                                   |
| `AUTH_MICROSOFT_TENANT_ID`     | with the other two   |                 | no     | Entra tenant id. Use your tenant, not `common`, unless multi-tenant sign-in is intended.                                                                                            |
| `AUTH_GOOGLE_CLIENT_ID`        | with the secret      |                 | no     | Google OAuth client id.                                                                                                                                                             |
| `AUTH_GOOGLE_CLIENT_SECRET`    | with the id          |                 | yes    | Google OAuth client secret.                                                                                                                                                         |
| `AUTH_OIDC_NAME`               | with the other three |                 | no     | Button label for the generic OIDC provider, e.g. `Okta`.                                                                                                                            |
| `AUTH_OIDC_ISSUER`             | with the other three |                 | no     | Issuer URL; discovery is read from `<issuer>/.well-known/openid-configuration`.                                                                                                     |
| `AUTH_OIDC_CLIENT_ID`          | with the other three |                 | no     | OIDC client id.                                                                                                                                                                     |
| `AUTH_OIDC_CLIENT_SECRET`      | with the other three |                 | yes    | OIDC client secret.                                                                                                                                                                 |

Each identity provider is enabled only when **all** of its variables are set; a partially
configured provider is a startup error. Without any provider nobody can sign in.
Provider setup is on [Authentication and authorization](Authentication-and-Authorization#identity-providers).

The web app validates its environment on first use rather than at import, so `next build` needs
no runtime values.

## Migrations and tests

| Name                | Where                                       | Description                                                                               |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | `packages/db/.env` or the `migrate` service | Database the migrate script applies migrations to.                                        |
| `TEST_DATABASE_URL` | shell or CI                                 | Enables the API's Postgres integration suites (see [Testing](Testing#integration-tests)). |

## Build time vs runtime

Almost everything is read at runtime. The exceptions are Docker build arguments, used when CI
builds the images for its smoke test:

| Build argument              | Image | Effect                                                                                                  |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_MAX_UPLOAD_MB` | web   | Inlined into the browser bundle. CI passes the repository variable `MAX_UPLOAD_MB`, or `25` when unset. |
| `GIT_SHA`                   | api   | Exposed as the `GIT_SHA` env var (Observe service version).                                             |

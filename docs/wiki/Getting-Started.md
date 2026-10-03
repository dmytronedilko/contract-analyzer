# Getting started

This page takes a developer from a fresh clone to asking a question about a contract on their
machine. It covers prerequisites, the local services, signing in through the mock identity
provider and the first upload.

## Prerequisites

- **Node.js 24** (`.nvmrc` pins it; with nvm run `nvm use`).
- **pnpm 11**, from the `packageManager` field: `corepack enable` (bundled with Node 24) installs
  the right version.
- **Docker** with Compose v2.24 or newer, for PostgreSQL and the mock identity provider.
- An **Anthropic API key** (answers) and a **Voyage AI API key** (embeddings). Without them the app
  runs, but uploads and questions fail with "The AI service is temporarily unavailable".
- Optional: a **NestJS Observe** account for traces and metrics (see [Observability](Observability)).

## 1. Clone and install

```sh
git clone {{repo}}.git contract-analyzer
cd contract-analyzer
corepack enable
pnpm install
```

`pnpm install` also installs the git hooks (lefthook). It refuses dependency versions published
less than 7 days ago; see [Dependencies](Dependencies) if an install is blocked.

## 2. Environment files

```sh
for f in apps/api apps/web packages/db; do cp "$f/.env.example" "$f/.env"; done
```

Then edit two values:

- `apps/api/.env`: set `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY`.
- `apps/web/.env`: set `BETTER_AUTH_SECRET` to the output of `openssl rand -base64 48`.

The examples already point at the local services and the mock identity provider. Every variable is
described on [Configuration](Configuration).

## 3. Start the services and migrate

```sh
pnpm services:up
pnpm db:migrate
```

`services:up` starts PostgreSQL 17 with pgvector (port 5432) and the mock OIDC provider (port 8080)
with Docker Compose and waits until they're ready. `db:migrate` creates the `vector` extension and
all tables.

## 4. Run the apps

```sh
pnpm dev
```

Turborepo starts every package's `dev` task, with hot reload:

| Process         | URL                                                |
| --------------- | -------------------------------------------------- |
| Web app         | http://localhost:3000                              |
| API             | http://localhost:3001 (`/health`, `/health/ready`) |
| Shared packages | compiled in watch mode                             |

## 5. Sign in and create an organization

1. Open http://localhost:3000 and choose **Continue with Mock SSO**.
2. The mock provider's login form accepts **any username**. Type e.g. `alice` and submit: you are
   signed in as `alice@example.com`, a verified address. Each username is a different user, which
   is handy for trying invitations and roles.
3. With no organization yet you land on **onboarding**: create one (you become its owner).

## 6. Upload a contract and ask

1. On **Documents**, drop a text-based PDF (not a scan) up to 25 MB.
2. Wait for "Processing (extracting, chunking, embedding)…" to finish: the row becomes **Ready**.
3. Choose **Ask** and try "What is the term of the agreement and how can it be terminated?".
4. Click a citation chip such as `chunk 2, p. 4` to read the excerpt it refers to.

Upload a second contract to try **Compare**.

## Common first-run problems

| Symptom                                                                | Likely cause                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ERR_PNPM_IGNORED_BUILDS` or an install blocked by `minimumReleaseAge` | [Troubleshooting](Troubleshooting#pnpm-install-errors)                                |
| The API exits with `Config validation error`                           | A required variable is missing in `apps/api/.env`; see [Configuration](Configuration) |
| Sign-in fails or loops back to `/sign-in`                              | [Troubleshooting](Troubleshooting#sign-in-problems)                                   |
| Upload answers "This PDF has no selectable text"                       | The PDF is a scan; see [RAG pipeline](RAG-Pipeline#limitations)                       |
| "The AI service is temporarily unavailable"                            | Missing or invalid Anthropic or Voyage key                                            |

More on the [Troubleshooting](Troubleshooting) page.

## Running everything in containers

`docker compose up --build` builds both images and runs the whole stack (database, mock provider,
migrations, API and web) as CI does. Signing in through the containerized stack needs a real
identity provider, because the browser can't resolve the mock's container hostname; day to day,
use `pnpm services:up` with `pnpm dev`.

# Troubleshooting

Development-time errors and how to fix them: installs, linting, configuration, containers,
uploads, origins, sign-in, signing keys and the mock identity provider.

## pnpm install errors

**`ERR_PNPM_IGNORED_BUILDS` / an install fails on an unapproved build script.** pnpm 11 runs no
dependency install scripts unless `allowBuilds` in `pnpm-workspace.yaml` decides them, and
`strictDepBuilds` fails the install while any is undecided. Check what the package's script does,
then add it to `allowBuilds` with `true` (needed, audited) or `false` (not needed), with a comment
saying why, in the same commit as the dependency. See [Dependencies](Dependencies#install-scripts).

**`MINIMUM_RELEASE_AGE_VIOLATION`, or "The lockfile contains entries that the active policies
reject".** A version younger than 7 days is required. Pin the newest version older than 7 days
instead (`npm view <package> time` lists publish dates). If a security fix can't wait, follow
[urgent security fixes](Dependencies#urgent-security-fixes). Never commit a lockfile resolved with
the policy relaxed.

**`ERR_PNPM_TRUST_DOWNGRADE`.** A version was published with weaker trust (no provenance) than
versions before it, which can indicate a hijacked package. Investigate before anything else; if it
is legitimate (e.g. a backport release from an old branch), add the exact version to
`trustPolicyExclude` with the reason, as was done for `semver@6.3.1`.

## Lint fails with "'X' is an 'error' type that acts as 'any'"

Type-aware rules need the shared packages' type declarations (`packages/*/dist`). `pnpm lint`
builds them first through Turborepo; running `oxlint` directly on a fresh checkout doesn't. Build
them once:

```sh
pnpm turbo run build --filter=@repo/contracts --filter=@repo/db
```

## Observe doesn't attach (no traces)

- Both `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` must be set **when the process starts**: Observe
  is enabled at import time. In development they must be in `apps/api/.env` (passed with
  `--env-file`); exporting them after start has no effect.
- `NestFactory.create` takes the application options as its **third** argument when an adapter is
  passed; options passed second (including `instrument`) are silently dropped. Don't change this in
  `main.ts`.
- Health checks and `OPTIONS` requests are deliberately not traced.

## Env validation fails during `next build`

Server code must not read the environment at module scope. Use `serverEnv()` from `lib/env.ts`
inside functions (route handlers, server components): it validates on first use, so `next build`
needs no runtime variables. The Better Auth instance and the database pool are created lazily for
the same reason.

## The API exits with "Config validation error"

The message lists each invalid or missing variable, e.g.
`DATABASE_URL: Invalid input: expected string, received undefined`. Fix `apps/api/.env` (see
[Configuration](Configuration)). `CORS_ORIGINS` entries must be exact origins without a path or
trailing slash, and `https` unless they are `http://localhost`.

## A container healthcheck fails

```sh
docker compose ps
docker inspect --format '{{json .State.Health}}' contract-analyzer-api-1 | jq
docker compose logs api
```

The API is healthy when `/health/ready` reaches the database; the web app when `/api/health`
reaches a ready API, so the web container waits for the API. A failing `migrate` service keeps the
API from starting.

## Uploads return 422 "no selectable text"

The PDF has no text layer: it's a scan or an image export. Run OCR on it (many PDF tools can add a
text layer) and upload the result. Test whether a PDF has text by trying to select text in a
viewer.

## 403 `ORIGIN_NOT_ALLOWED`

- **From the web app's `/api/backend/...`:** the request came from another site (`Sec-Fetch-Site`
  is `cross-site` or `same-site`), or a non-GET request carried an `Origin` other than `APP_URL`.
  Make sure you open the app at exactly `APP_URL` (same scheme, host and port).
- **From the API directly:** the request had an `Origin` header that isn't in `CORS_ORIGINS`. Servers
  and curl send no `Origin`; browser apps need their exact origin listed. See
  [API reference](API-Reference#cors-and-origins).

## Sign-in problems

**The provider says the redirect URI doesn't match.** Register exactly
`<APP_URL>/api/auth/callback/<provider>`, where `<provider>` is `microsoft`, `google` or `oidc`, e.g.
`https://contracts.example.com/api/auth/callback/microsoft`. `APP_URL` must be the URL users open.

**Back on `/sign-in` with "didn't confirm your email address".** The provider sent no verified email.
For Microsoft Entra ID, add the `verified_primary_email` optional claim (or `email_verified`) to the
app registration's ID token; see
[Authentication and authorization](Authentication-and-Authorization#identity-providers).

**"Accounts from your email domain aren't allowed".** The email's domain isn't in
`AUTH_ALLOWED_EMAIL_DOMAINS`.

**Redirected to `/sign-in` again and again (401 loop).**

- `APP_URL` doesn't match the address in the browser, so cookies or trusted origins don't match.
- Over plain `http://` with `NODE_ENV=production`, secure cookies aren't stored: use https, or
  development mode locally.
- The API rejects every token: `AUTH_ISSUER` must equal `APP_URL`, `AUTH_AUDIENCE` must match on both
  sides, and the API must reach `AUTH_JWKS_URL` (`http://web:3000/api/auth/jwks` in containers,
  `http://localhost:3000/api/auth/jwks` in development). API logs at debug level show the rejection
  reason's class.

## Clock skew in token verification

Tokens live 5 minutes and the API tolerates 30 seconds of clock difference. If the web and API hosts'
clocks drift further, every call fails with 401 `UNAUTHENTICATED` ("exp" or "nbf" claim
failures). Keep NTP enabled on hosts (`timedatectl status` should show "System clock synchronized:
yes").

## Signing keys and `BETTER_AUTH_SECRET`

The web app signs API tokens with an Ed25519 key from the `jwks` table, encrypted with
`BETTER_AUTH_SECRET`, and rotates it every 90 days on its own.

- **"Failed to decrypt private key" after changing `BETTER_AUTH_SECRET`:** the stored keys were
  encrypted with the old secret, and every existing session cookie is rejected too. Delete them, then
  restart `pnpm dev` and sign in again; a new key is created on the first API call:

  ```sh
  docker compose exec db psql -U postgres -d contracts -c 'DELETE FROM jwks; DELETE FROM session;'
  ```

- **Retiring a signing key** (e.g. it was exposed): `DELETE FROM jwks;` the same way, then restart
  the API so it forgets cached keys. Tokens signed with it stop working within 5 minutes; sessions
  are unaffected.

## The mock OIDC provider

- **Port 8080 is already in use:** stop whatever uses it, or change the published port in
  `docker-compose.yml` and `AUTH_OIDC_ISSUER` together.
- **Sign-in works with `pnpm dev` but not in the containerized stack:** the issuer must be the same
  URL for the browser and the web server. With `pnpm dev` both use `http://localhost:8080/default`;
  in containers the web app uses `http://oidc:8080/default`, which browsers can't resolve.
- **Which user am I?** The username typed on the mock's login form becomes `<username>@example.com`,
  verified. The same username always maps to the same user.
- After changing `JSON_CONFIG`, recreate the container: `docker compose up -d --force-recreate oidc`.

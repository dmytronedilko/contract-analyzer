# CI/CD

Every GitHub Actions workflow: when it runs, what its jobs do, which check gates merging, how the
merging and caching work, the variables that gate paid features, and how to read and re-run a
failed job. Read this when a check fails or before changing a workflow.

## Workflows

| Workflow                                                                                | Triggers                                          | Purpose                                                                              |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [CI]({{repo}}/blob/main/.github/workflows/ci.yml)                                       | pull requests, push to `main`                     | Quality, tests, builds, images, smoke test, commit and workflow lint, security scans |
| [Release]({{repo}}/blob/main/.github/workflows/release.yml)                             | manual, on `main`                                 | Version, annotated tag, GitHub Release                                               |
| [CodeQL]({{repo}}/blob/main/.github/workflows/codeql.yml)                               | pull requests, push to `main`, weekly             | Code scanning (security-extended) of TypeScript and the workflows                    |
| [Scorecard]({{repo}}/blob/main/.github/workflows/scorecard.yml)                         | push to `main`, weekly, branch protection changes | OpenSSF Scorecard (public repositories only)                                         |
| [Dependabot auto-merge]({{repo}}/blob/main/.github/workflows/dependabot-auto-merge.yml) | Dependabot pull requests                          | Arms auto-merge for patch and minor updates, labels majors                           |
| [Wiki]({{repo}}/blob/main/.github/workflows/wiki.yml)                                   | push to `main` touching the wiki, manual          | Validates and publishes `docs/wiki/`                                                 |

All workflows pin actions to full commit SHAs, start from `permissions: {}` and grant each job only
what it needs, check out without persisted credentials, and pass expressions to scripts through
`env:`.

## CI jobs

| Job                 | Runs                                                 | What it does                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`           | always                                               | `pnpm format:check`, then oxlint and every package's typecheck through Turborepo                                                                                                                                                                                                                |
| `test`              | always                                               | All Vitest suites; the API's integration suites against a `pgvector/pgvector:pg17` service container (migrations applied by the test setup)                                                                                                                                                     |
| `build`             | always                                               | Builds every package and app                                                                                                                                                                                                                                                                    |
| `docker`            | always                                               | Bakes both images, scans them with Trivy (fails on fixable CRITICAL/HIGH), starts the compose stack with `docker-compose.ci.yml` and asserts `/api/health` is 200, `/documents` redirects to `/sign-in` and `/api/backend/documents` is 401 `UNAUTHENTICATED`; prints container logs on failure |
| `commits`           | pull requests                                        | commitlint over every commit in the pull request                                                                                                                                                                                                                                                |
| `workflows`         | always                                               | actionlint (with shellcheck) and zizmor                                                                                                                                                                                                                                                         |
| `docs`              | always                                               | `node scripts/wiki/validate.mjs`                                                                                                                                                                                                                                                                |
| `secrets`           | pull requests, when `SECRET_PROTECTION` is `'false'` | gitleaks over the pull request's commits                                                                                                                                                                                                                                                        |
| `dependency-review` | pull requests, unless `CODE_SECURITY` is `'false'`   | Fails on new high-severity vulnerabilities                                                                                                                                                                                                                                                      |
| `ci-ok`             | always                                               | Fails if any job above failed or was cancelled; skipped jobs count as passing                                                                                                                                                                                                                   |

Superseded pull request runs are cancelled; runs on `main` always finish.

## Required checks and merging

`ci-ok` is the **only** required status check (from the GitHub Actions app). With it, the `main`
ruleset requires a pull request with an approving review (and code-owner approval) unless solo
mode is on, resolved threads, linear history, CodeQL results without high or higher security
alerts, and a branch that is **up to date with `main`**:

1. A pull request is approved (when required) and green.
2. If `main` moved since, "Update branch" (or a rebase) brings it up to date and CI runs again.
3. With `ci-ok` passing on the up-to-date branch, it is rebase-merged: the commits land on `main`
   unchanged, and CI runs once more on `main`.

GitHub's merge queue, which batches and tests merges automatically, is only available to
organization-owned repositories, so it isn't used.

## Caching

- pnpm's store is cached by `actions/setup-node` (keyed on the lockfile).
- Turborepo's local cache (`.turbo/cache`) is cached per job and commit with `actions/cache`.
  When the repository has `TURBO_TOKEN` (secret) and `TURBO_TEAM` (variable), Vercel Remote Cache is
  used instead, except on pull requests, so pull request code can't read the token or write cache
  entries that `main` builds reuse.
- Docker layers use the GitHub Actions cache, one scope per image.

## Gating variables

`apply-repo-settings.sh` sets two repository variables from the features it detects:

| Variable            | `'false'` means                                     | Effect                                                                          |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `CODE_SECURITY`     | Private repository without GitHub Code Security     | CodeQL and dependency review are skipped; the ruleset has no code scanning rule |
| `SECRET_PROTECTION` | Private repository without GitHub Secret Protection | CI runs gitleaks as a fallback secret scan                                      |

On public repositories both are `'true'`.

## Release

Run **Actions → Release → Run workflow** on `main`. It
computes the next version from the Conventional Commits since the last tag (the first release is
`v0.1.0`; a `version` input overrides it), creates an annotated tag with the release notes, creates
and the GitHub Release. Release tags are
protected: only this workflow can create them, and nobody can move or delete them. There is no
`CHANGELOG` file; releases are the changelog. See
[Development workflow](Development-Workflow#releases).

## Reading and re-running a failed job

1. Open the failed `ci-ok` check: it lists the failed job. `ci-ok` itself only reports.
2. Open that job's log; failed steps are expanded. For `docker`, the "Container logs" step has the
   services' output.
3. Reproduce locally (see [Testing](Testing) and [Troubleshooting](Troubleshooting)):

   ```sh
   pnpm format:check && pnpm lint && pnpm turbo run typecheck test build
   docker buildx bake --load && docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --no-build --wait
   ```

   The compose command expects the images tagged `local/api:ci` and `local/web:ci`:
   `docker tag local/api:dev local/api:ci && docker tag local/web:dev local/web:ci`.

4. For a flaky failure (network, registry), use **Re-run failed jobs**. With the GitHub CLI:

   ```sh
   RUN_ID=$(gh run list --workflow ci.yml --status failure --limit 1 --json databaseId --jq '.[0].databaseId')
   gh run view "$RUN_ID" --log-failed
   gh run rerun "$RUN_ID" --failed
   ```

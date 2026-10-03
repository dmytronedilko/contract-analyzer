# Dependencies

How dependencies are installed, updated and reviewed: pnpm's supply-chain settings, install
scripts, Dependabot's schedule, groups and cooldown, auto-merge, reviewing major updates, the
procedure for urgent security fixes, and pinned actions and images. Read this before adding or
updating a dependency.

## pnpm hardening

[`pnpm-workspace.yaml`]({{repo}}/blob/main/pnpm-workspace.yaml) adds, on top of pnpm 11's defaults:

| Setting                        | Effect                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimumReleaseAge: 10080`     | Only versions published at least **7 days** ago are installed. Hijacked releases are usually detected and pulled within days. Matches the Dependabot cooldown.                                  |
| `minimumReleaseAgeExclude: []` | Temporary exceptions for urgent security fixes only (see below).                                                                                                                                |
| `trustPolicy: no-downgrade`    | Refuses a version published with weaker trust (no provenance or trusted publisher) than versions before it, a sign of a takeover. Reviewed exceptions go in `trustPolicyExclude` with a reason. |
| `blockExoticSubdeps: true`     | Transitive dependencies only from the registry, never git URLs or tarballs.                                                                                                                     |
| `strictDepBuilds: true`        | The install fails while any dependency's install script is undecided.                                                                                                                           |

Direct dependencies are pinned to exact versions. Add one with
`pnpm --filter <package> add <name>@<version>`, choosing a version older than 7 days.

## Install scripts

Dependency install scripts never run unless `allowBuilds` decides them, package by package, with a
comment saying why:

| Package     | Decision | Why                                                           |
| ----------- | -------- | ------------------------------------------------------------- |
| `@swc/core` | allowed  | Verifies its native binary (API tests compile with SWC).      |
| `esbuild`   | allowed  | Verifies and links its platform binary (drizzle-kit, Vitest). |
| `lefthook`  | denied   | The root `prepare` script installs the git hooks instead.     |

Docker builds install with `--ignore-scripts`: nothing the builds use needs a script.

## Dependabot

[`.github/dependabot.yml`]({{repo}}/blob/main/.github/dependabot.yml), every Monday at 06:00 UTC,
labelled `dependencies`, at most 10 open pull requests per ecosystem:

| Ecosystem      | Scope                                                                                          | Commit messages                        |
| -------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| npm            | The root lockfile (every workspace package)                                                    | `build(deps): …`, `chore(deps-dev): …` |
| github-actions | Workflows and the composite setup action (SHA pins and their version comments), one grouped PR | `ci(deps): …`                          |
| docker         | Base image digests in both Dockerfiles; Node majors ignored                                    | `build(deps): …`                       |
| docker-compose | pgvector and mock OIDC digests in the Compose stack                                            | `build(deps): …`                       |

**Cooldown:** version updates wait 7 days (14 for majors), never less than pnpm's release age.
Security updates are raised immediately.

**npm groups** (a package joins the first group that matches):

| Group             | Packages                                      | Update types                               |
| ----------------- | --------------------------------------------- | ------------------------------------------ |
| `nestjs`          | `@nestjs/*`                                   | all: they must move together               |
| `drizzle`         | `drizzle-orm`, `drizzle-kit`                  | all                                        |
| `better-auth`     | `better-auth`, `@better-auth/*`               | all                                        |
| `oxc`             | `oxlint`, `oxlint-tsgolint`, `oxfmt`          | all                                        |
| `next-react`      | `next`, `react`, `react-dom`, `@types/react*` | all                                        |
| `types`           | `@types/*`                                    | all                                        |
| `minor-and-patch` | everything else                               | minor and patch; majors get individual PRs |
| `security`        | everything                                    | security updates, in one PR                |

Ignored: TypeScript majors (the NestJS 12 tooling is on TypeScript 6) and `@types/node` majors (Node
24).

## Auto-merge

For Dependabot's patch and minor pull requests,
[`dependabot-auto-merge.yml`]({{repo}}/blob/main/.github/workflows/dependabot-auto-merge.yml)
arms auto-merge (rebase): the PR merges once its branch is up to date, the review requirement is met
and `ci-ok`
passes. Major updates get the `major-update` label and nothing else. The workflow never approves;
Actions can't approve pull requests, so a human reviews every dependency update.

## Reviewing updates

- **Patch and minor**: read the changelog in the PR, check CI, approve.
- **Majors** (`major-update` label): read the release notes and migration guide, check the bump's
  effect on the rest of the stack (NestJS, Next.js and Better Auth versions move together), run the
  app locally, add commits to the PR for any code changes, and update docs if behavior changed.
- Grouped PRs (`nestjs`, `next-react`…) are tested and merged as one.

## Urgent security fixes

When a patched version is needed before it is 7 days old:

1. `pnpm audit --fix` upgrades the vulnerable package and adds the patched version to
   `minimumReleaseAgeExclude`.
2. Review the version (changelog, publisher, provenance), then open a pull request with a
   `fix(deps): …` commit explaining the advisory.
3. Once the version is older than 7 days, remove its `minimumReleaseAgeExclude` entry in a follow-up
   pull request.

The same procedure is in [`SECURITY.md`]({{repo}}/blob/main/SECURITY.md).

## Pinned actions and images

- Every GitHub Action is pinned to a full commit SHA with a `# vX.Y.Z` comment, and the repository
  requires SHA pinning; only GitHub-owned actions and an explicit allowlist may run (see
  [Repository settings](Repository-Settings)). Dependabot updates the pins.
- Every container image (Node, pgvector, the mock provider) is pinned by digest, with the tag
  kept for readability. Dependabot updates the digests.

# Development workflow

The day-to-day workflow: root scripts, the commit conventions and hooks, rebasing and keeping every
commit green, branches and pull requests, rebase-only merges of up-to-date branches, code owners,
releases, and keeping the documentation in sync. Read this before your first pull request.

## Root scripts

| Script                              | What it does                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Every package's `dev` task: API (`nest start --watch` with `apps/api/.env`), web (`next dev`), shared packages in `tsc --watch` |
| `pnpm build`                        | Builds everything (Turborepo, shared packages first, cached)                                                                    |
| `pnpm typecheck`                    | `tsc --noEmit` in every package (web runs `next typegen` first)                                                                 |
| `pnpm test`                         | Every package's Vitest suites                                                                                                   |
| `pnpm lint`                         | oxlint over the repository, after building the shared packages (`turbo run lint:repo`)                                          |
| `pnpm lint:fix`                     | oxlint with safe fixes applied                                                                                                  |
| `pnpm format` / `pnpm format:check` | oxfmt: format, or check without writing                                                                                         |
| `pnpm services:up`                  | Starts PostgreSQL and the mock OIDC provider with Docker Compose and waits for them                                             |
| `pnpm db:generate`                  | Generates a migration from schema changes (drizzle-kit)                                                                         |
| `pnpm db:migrate`                   | Applies migrations to `DATABASE_URL` (`packages/db/.env`)                                                                       |
| `pnpm commitlint`                   | commitlint, e.g. `pnpm commitlint --from origin/main`                                                                           |
| `pnpm changelog`                    | Release notes for unreleased commits (git-cliff)                                                                                |
| `prepare`                           | Runs on install: installs the git hooks (lefthook)                                                                              |

Packages only have `build`, `dev`, `typecheck` and `test`; lint and format run once at the root. To
run one package's task: `pnpm turbo run test --filter=@repo/api`.

## Commits

The history is part of the product: it should explain how and why the system changed, and every
commit on `main` must be useful to `git log`, `git blame` and `git bisect`.

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`.

- **Types**: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- **Scopes** (optional): `contracts`, `api`, `db`, `web`, `docker`, `deploy`, `deps`, `deps-dev`,
  `ci`, `wiki`, `repo`, `security`, `auth`, `vscode`, `release`.
- **Subject**: imperative, lowercase start, no trailing period; header at most 72 characters.
- **Body: always.** Wrapped at 72 columns: the problem, the approach, rejected alternatives and
  trade-offs, and whatever a future reader of `git blame` needs. Reference the ADR or wiki page.
- **Footers**: `Refs:` for related commits or issues; `BREAKING CHANGE:` when applicable.

Good:

```
feat(api): add exact per-document vector search

Retrieval always targets a single document, so scanning that
document's chunks through the document_id B-tree index is fast and
always returns k rows. An HNSW index was rejected: with a WHERE
filter it can return fewer than k rows, silently weakening answers.

Refs: ADR "Exact search instead of HNSW"
```

Bad:

- `Fixed stuff` (no type, says nothing)
- `feat(api): Add search.` (capitalized, period, and no body)
- `fixup! feat(api): add search` (fixups must be squashed before merging)

**Granularity.** One logical change per commit: a module, an endpoint, a page, a workflow, a test
suite. Don't mix refactoring, formatting and features. Commit generated code (shadcn components,
migrations, the Better Auth schema) separately and say it's generated. Lockfile changes go with the
dependency change that caused them.

## Hooks

`pnpm install` installs lefthook's hooks:

- **pre-commit**: oxfmt and `oxlint --fix` on staged files; fixes are re-staged.
- **commit-msg**: commitlint.

commitlint rejects `fixup!`, `squash!`, `amend!` and WIP commits on purpose; CI's `commits` job
checks every commit of a pull request too. Don't bypass hooks with `--no-verify`.

## Keeping every commit green

From the commit that added the tooling onward, every commit passes `pnpm format:check`,
`pnpm lint`, and typecheck and tests. Clean up and verify a branch before asking for review:

```sh
git fetch origin
git rebase -i --autosquash origin/main                         # squash fixup! commits into their targets
git rebase -x 'pnpm turbo run typecheck test' origin/main      # runs the checks on every commit
```

`git commit --fixup=<sha>` creates commits that `--autosquash` folds into `<sha>`.

## Formatting-only commits

A repository-wide `pnpm format` belongs in its own commit; then add that commit's full SHA to
`.git-blame-ignore-revs` in a follow-up commit. GitHub's blame view honors the file; locally:

```sh
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

## Branches, pull requests and merging

1. Branch from `main` (`feat/upload-progress`, `fix/compare-404`…), commit, push, open a pull
   request. The template's checklist covers tests, commits, docs, migrations, prompt and auth
   reviews, and secrets.
2. **Code owners** review their areas: prompts, auth and permissions, and CI and tooling each
   have their own entries in [`CODEOWNERS`]({{repo}}/blob/main/.github/CODEOWNERS). All are
   currently owned by `@dmytronedilko`; the separate entries let each area move to a team later.
3. `main` accepts **rebase merges only**, of branches that are **up to date with `main`** and have
   a green `ci-ok`: use "Update branch" (or rebase) when `main` moved, and CI runs again on the
   result. The commits land unchanged; history stays linear, with no merge or squash commits.
   GitHub's merge queue would automate this, but it is only offered to organization-owned
   repositories.
4. A push after approval dismisses the approval; conversations must be resolved.

Details on [CI/CD](CI-CD#required-checks-and-merging) and
[Repository settings](Repository-Settings).

## Releases

1. **Actions → Release → Run workflow** on `main`, or `gh workflow run release.yml`. Leave `version`
   empty to compute it from the commits since the last tag: `feat` bumps the minor version, other
   types the patch, and a `BREAKING CHANGE` footer the major (only the minor while still at 0.x);
   the first release is `v0.1.0`.
2. The workflow creates the annotated tag `vX.Y.Z` with the release notes and the GitHub Release.
   No images are published.

Preview the notes with `pnpm changelog`. There is no `CHANGELOG` file: GitHub Releases are the
changelog, generated from the commit history.

## Keeping the docs in sync

Change `docs/wiki/` in the same pull request as the behavior, configuration, API or operations it
describes, and list the pages in the pull request. `node scripts/wiki/validate.mjs` checks links and
structure, and drift tests fail when an env variable, error code, permission, audit action, metric
name or the "not found" sentences are missing from their page (see
[Testing](Testing#docs-drift-tests)). The wiki is published from `main` automatically; never edit it
on GitHub.

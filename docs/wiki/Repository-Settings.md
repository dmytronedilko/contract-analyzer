# Repository settings

What the repository settings script configures, how and when to run it, the rulesets, the gating
variables, the settings that can only be changed by hand, and which GitHub plans the features need.
Read this when setting up the repository or changing its protections.

## The script

[`scripts/github/apply-repo-settings.sh`]({{repo}}/blob/main/scripts/github/apply-repo-settings.sh)
applies the settings with `gh api` (REST API version `2026-03-10`). It is idempotent, prints a
summary of what it applied, skipped and left to do by hand, and supports `--dry-run`.

Run it as a repository admin, **never from CI**:

- once, after the first push and after CI has run at least once (so the `ci-ok` check is known);
- again after any change to the script or to `.github/rulesets/`.

```sh
gh auth login                          # an account with admin rights on the repository
scripts/github/apply-repo-settings.sh --dry-run
REQUIRED_APPROVALS=0 scripts/github/apply-repo-settings.sh
```

| Variable             | Meaning                                                                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRED_APPROVALS` | Approvals required on pull requests (default 1). `0` suits a solo maintainer: it also turns off code-owner review and last-push approval (GitHub never lets you approve your own pull request); everything else stays. |

It needs `gh` and `jq`, detects the repository's visibility and features, and applies what the plan
allows.

## What it configures

1. **Merge settings**: rebase merges only (squash and merge commits off), delete branches on merge,
   auto-merge, always suggest updating branches; wiki on, Projects off.
2. **Security features**: secret scanning, push protection, non-provider patterns and validity
   checks; Dependabot alerts and security updates; private vulnerability reporting; CodeQL default
   setup **off** (the advanced setup in `codeql.yml` conflicts with it).
3. **Gating variables** `CODE_SECURITY` and `SECRET_PROTECTION` (see below).
4. **Actions policy**: only GitHub-owned actions plus an allowlist of exactly the third-party
   actions the workflows use (`docker/*` actions, `pnpm/action-setup`, `dependabot/fetch-metadata`,
   Trivy, actionlint, zizmor, Scorecard); full-SHA pinning required; the default `GITHUB_TOKEN` is
   read-only and can't create or approve pull requests; on public repositories, workflows from forks
   need approval for every external contributor.
5. **Rulesets** from `.github/rulesets/*.json`, created or updated by name.

## Rulesets

**`main`** ([`main.json`]({{repo}}/blob/main/.github/rulesets/main.json)), on the default branch:

| Rule                   | Setting                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deletion, force pushes | blocked                                                                                                                                           |
| Linear history         | required                                                                                                                                          |
| Pull requests          | 1 approval, stale approvals dismissed on push, code-owner review, approval of the last push, resolved conversations, rebase only                  |
| Status checks          | `ci-ok` from the GitHub Actions app (integration 15368), so only Actions can satisfy it; the branch must be up to date with `main` before merging |
| Code scanning          | CodeQL: no high or higher security alerts, no errors (dropped when `CODE_SECURITY` is `'false'`)                                                  |

There are no bypass actors.

**`release-tags`** ([`tags.json`]({{repo}}/blob/main/.github/rulesets/tags.json)) protects
`refs/tags/v*` against creation, update and deletion. The GitHub Actions app is the only bypass
actor, so release tags can only be created by the Release workflow and never moved or deleted. If
GitHub rejects that bypass actor for the repository, the script allows repository admins instead,
says so in its summary, and the Release workflow's tag push then needs an admin's token.

## Gating variables

| Variable            | Set to                                                                                                          | Used by                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `CODE_SECURITY`     | `'true'` when CodeQL can run (public repositories, or private ones with GitHub Code Security)                   | CodeQL and dependency review run only when it isn't `'false'`; the ruleset's code scanning rule |
| `SECRET_PROTECTION` | `'true'` when secret scanning is available (public repositories, or private ones with GitHub Secret Protection) | CI's gitleaks job runs only when it is `'false'`                                                |

## Manual settings

The script lists these in its summary when they apply:

- **Wiki editing** (public repositories): Settings → General → Features → Wikis → enable "Restrict
  editing to collaborators only". The wiki is published from `docs/wiki/` and direct edits are
  overwritten, but restricting editing keeps the public from changing it in between.
- **Copilot Autofix** for code scanning: Settings → Code security, where available (no REST setting).
- **Secret scanning validity checks**, if the API refuses to enable them.

## Plan requirements

There is no merge queue: GitHub offers it only to organization-owned repositories. Instead,
pull requests must be up to date with `main` before they merge, so `ci-ok` always ran on the result.

| Feature                                     | Public repository | Private repository                                                  |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| Rulesets                                    | yes               | needs GitHub Team or Enterprise for organization-owned repositories |
| Secret scanning, push protection            | yes               | needs GitHub Secret Protection (else gitleaks in CI)                |
| CodeQL code scanning, dependency review     | yes               | needs GitHub Code Security (else skipped)                           |
| OpenSSF Scorecard                           | yes               | not run                                                             |
| Dependabot, private vulnerability reporting | yes               | yes                                                                 |

Check your organization's current plan; GitHub's plan contents change over time.

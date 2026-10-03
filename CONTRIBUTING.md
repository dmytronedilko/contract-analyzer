# Contributing

Thanks for helping. The full workflow (commit conventions, hooks, rebasing, pull requests, the
rebase merges and releases) is described on the wiki's
[Development workflow](https://github.com/dmytronedilko/contract-analyzer/wiki/Development-Workflow) page.
In short:

- Branch from `main` and open a pull request; `main` only changes through rebase-merged pull
  requests whose branch is up to date and green.
- Write [Conventional Commits](https://www.conventionalcommits.org/) with a body that explains
  why. Every commit must build and pass tests on its own; squash fixups before merging
  (`git rebase -i --autosquash main`).
- Run `pnpm format`, `pnpm lint` and `pnpm turbo run typecheck test` before pushing; the git
  hooks installed by `pnpm install` check formatting, lint and commit messages.
- Update `docs/wiki/` in the same pull request when behavior, configuration, the API or operations
  change.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md).

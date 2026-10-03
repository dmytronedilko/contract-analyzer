# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/dmytronedilko/contract-analyzer/security/advisories/new)
("Report a vulnerability" on the Security tab). Never open a public issue, pull request or
discussion about a suspected vulnerability.

Include what you found, how to reproduce it, the affected version or commit, and the impact you
expect. We acknowledge reports within 3 business days and keep you updated until the issue is
resolved and disclosed.

## Supported versions

Only the latest commit on `main` (and the release built from it) is supported. Fixes are not
backported.

## Scope

Reports are especially welcome for:

- **Confidential contracts.** Uploaded documents, their extracted text, questions and answers must
  never leak: not to other users, not into logs, telemetry or audit metadata, and not to anyone
  outside the providers the data boundary allows (Voyage AI for embeddings, Anthropic for answers).
- **Tenant isolation.** A user must never see, query, compare or delete another organization's
  documents, or learn that they exist.
- **Authentication and authorization.** Sign-in (SSO only), sessions, the short-lived API tokens,
  role checks, invitations and membership changes.
- **Prompt injection through uploaded documents**, where it leads to data disclosure across
  documents or organizations, or to the model following instructions embedded in a contract.
- **Provider and infrastructure secrets** (API keys, `BETTER_AUTH_SECRET`).

Out of scope: findings that require a compromised identity provider or host, denial of service by
volume, and the model's legal accuracy (answers are not legal advice).

## Urgent dependency fixes

Dependencies are only installed once published for 7 days (`minimumReleaseAge` in
`pnpm-workspace.yaml`), matching the Dependabot cooldown. When a security fix can't wait:

1. Run `pnpm audit --fix`. It upgrades the vulnerable package and adds the patched version to
   `minimumReleaseAgeExclude` so it can be installed before it is 7 days old.
2. Review the new version (changelog, publisher, provenance) and open a pull request with a
   `fix(deps): ...` commit that explains the advisory.
3. Once the version is older than 7 days, remove its `minimumReleaseAgeExclude` entry in a
   follow-up pull request.

## More

The threat model, data handling and the controls in place are described on the wiki's
[Security](https://github.com/dmytronedilko/contract-analyzer/wiki/Security) page.

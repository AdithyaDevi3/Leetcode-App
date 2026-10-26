# Security

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/AdithyaDevi3/Leetcode-App/security/advisories/new).
Include affected behavior, reproduction steps, likely impact, and safe request
identifiers when available. Avoid public issues for exploitable vulnerabilities,
credentials, or personal data.

Do not include real passwords, access tokens, session cookies, database URLs,
learner submissions, or database dumps. Use synthetic examples and redact
sensitive values. Coordinate testing with maintainers and avoid disruptive tests
against other people's accounts or the hosted application.

## Supported code

Security fixes target the current main branch. Older snapshots and preview
deployments do not have a separate supported maintenance line.

## Contributor responsibilities

Keep secrets server-side, authorize access to the concrete object, and preserve
private grade drafts, instructor notes, and learner ownership. Report accidental
credential exposure promptly so maintainers can revoke or rotate the credential.
Deleting a file or commit does not by itself invalidate exposed credentials.

The [architecture](docs/ARCHITECTURE.md) describes the application's trust
boundaries; [development conventions](docs/CONVENTIONS.md) cover changes and tests.

# Development conventions

Use [usage](USAGE.md) for setup, [architecture](ARCHITECTURE.md) for boundaries,
and [CONTRIBUTING.md](../CONTRIBUTING.md) for selecting and delivering work.

## Code and boundaries

- Keep TypeScript strict, avoid unnecessary dependencies, and reuse existing
  components, tokens, contracts, and repository methods.
- Keep domain policies independent of React and provider SDKs. Inject time,
  randomness, and provider calls at test boundaries; version stored rule outputs.
- Validate request bodies and authorize the concrete learner, class, or recipient
  on the server. Navigation visibility is not an access control.
- Require idempotency for retryable mutations and optimistic revision checks for
  edits. Return actionable conflict/error states without exposing internal data.
- Put transactions in repositories. Add forward migrations; preserve published
  migrations, content versions, grade evidence, and audit history.
- Wrap providers behind bounded adapters with timeouts, retry limits, and quotas.
  Default tests must not contact paid providers.
- Preserve semantic HTML, keyboard access, focus, save announcements, and mobile
  reflow. UI changes need evidence for complete tasks and recovery states.

## Validation

```bash
pnpm docs:check
pnpm test:docs
pnpm --filter web lint
pnpm --filter web typecheck
pnpm -r test
pnpm --filter web build
pnpm --filter web test:e2e
```

pnpm preflight runs the repository release gate, including the documentation
boundary. Use focused checks while iterating. Database changes need meaningful
integration evidence against an ephemeral PostgreSQL instance. API changes need
ownership, validation, and failure coverage; learner flows need browser evidence.
Evaluator changes need gold-set regressions and scrutiny of false acceptances.

## Public documentation boundary

The complete public guide list is in [README.md](../README.md). The exact tracked
file allowlist is defined in scripts/check-public-docs.mjs and mirrored in the
root .gitignore. The only additional Markdown files are the existing GitHub bug,
feature, and pull-request templates. Maintainers review changes to this boundary.

Keep detailed plans, implementation notes, internal checklists, agent/skill
instructions, scratch documents, and generated artifacts in ignored local
storage. Do not link public guides to local-only files. Exports, recordings,
credentials, environment files, and real learner data must never be staged.

The check reads Git's tracked index, so forced additions and already-tracked
ignored files are caught. It also validates local links and section anchors
against tracked files. Ignore rules alone do not remove tracked documents.
Removing a file from the current tree does not erase earlier public Git history.

## Content and grading

Publish original or approved licensed material with provenance, immutable
versions, clear objectives, and reviewed examples/solutions. An executable
activity needs compatible starters and trusted tests for each offered language.
Keep private keys, hidden tests, grade drafts, and instructor notes out of learner
responses. Preserve exact point units and distinguish unpublished, pending,
unavailable, and numeric outcomes.

## Delivery and operations

Keep main deployable. Use one focused branch/PR, review its complete staged diff,
and keep unrelated local files out of the commit. Required CI/review gates must
pass before merge. Preserve unique work when cleaning merged branches.

Apply compatible migrations before dependent application queries. Configure
secrets through managed deployment settings and verify health plus the changed
workflow after deployment. Roll back application access or use a reviewed
forward fix while preserving submitted work and immutable grading history.

Use request IDs and aggregate telemetry. Never log learner code, private notes,
tokens, cookies, or credentials. Validate backup/restore and provider limits
before relying on a hosted integration. Sensitive reports belong in
[the private reporting channel](../SECURITY.md).

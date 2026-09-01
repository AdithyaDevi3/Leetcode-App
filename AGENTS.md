# Engineering delivery rules

These rules apply to every human or automated contributor in this repository.

## Source control

- Start every branch and worktree from the latest `origin/main`, unless the approved PR plan explicitly names a prerequisite branch as the temporary base of a stacked PR.
- Never commit directly to `main`, force-push a shared branch, or bypass required checks.
- Use one short-lived branch and one pull request for one coherent outcome.
- Use a dedicated worktree for each concurrent write task. Only one agent may write to a branch.
- Preserve unrelated user changes. Do not mix cleanup or opportunistic refactors into a focused PR.
- Use Conventional Commits. Commit each reviewable slice after its tests pass; do not hand off uncommitted work.

## Implementation sequence

- Follow `docs/DELIVERY_PLAN.md`. End-to-end learner reliability is the active gate.
- Do not activate ML personalization until the data, privacy, baseline, and rollout gates in that plan pass.
- Add or update a failing regression test before a behavioral fix when practical.
- Keep unfinished AI evaluation, code execution, notification delivery, and ML ranking behind server-controlled flags with deterministic fallbacks.

## Required validation

- Run the narrowest relevant test while developing.
- Before pushing, run `pnpm preflight` and any PR-specific integration, migration, browser, accessibility, security, or evaluation-quality checks.
- Database changes require forward compatibility, migration integration tests, authorization/RLS evidence, restore impact, and an explicit rollback-or-forward-fix plan. Do not add a destructive down migration merely to satisfy a checklist.
- User-journey changes require Playwright coverage for the affected success and failure paths.
- Do not weaken, skip, mute, or mark a required check as non-blocking to make CI pass.
- Never claim staging or production behavior without recorded evidence from that environment.

## Pull requests

- Complete every section of `.github/PULL_REQUEST_TEMPLATE.md` with reproducible evidence.
- State the outcome, non-goals, requirement IDs, failure behavior, security/privacy impact, telemetry, rollout, and rollback.
- Keep commits atomic and the diff small enough for one reviewer to understand completely.
- Reconcile with the PR's declared base before final review, change stacked PRs back to `main` after prerequisites merge, and rerun required checks after conflict resolution.
- The implementation agent may not approve or merge its own PR. A separate reviewer must inspect the branch diff against its actual declared base.
- Update `docs/IMPLEMENTATION_STATUS.md`, `docs/REQUIREMENTS_MATRIX.md`, or `docs/DELIVERY_PLAN.md` whenever delivered behavior or evidence changes.

## Review rules

- Prioritize correctness, data ownership, idempotency, concurrency, failure recovery, accessibility, privacy, and operational safety over style.
- Verify that tests exercise real boundaries instead of only mocked success paths.
- Reject changes that introduce unversioned learning events, recommendation decisions, model artifacts, or evaluator behavior.
- Reject personalization that uses raw submissions, free text, direct identifiers, accessibility notes, or information unavailable at scoring time for the decision being evaluated—including that recommendation's own outcome—as model features.
- Require a deterministic fallback and kill switch for every learned or external-provider decision path.

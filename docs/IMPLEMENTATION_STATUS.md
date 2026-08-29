# Implementation status notes

Snapshot: `phase-3-evaluation-platform` at the time of writing. This is an implementation ledger, not a declaration that any phase has passed its exit criteria. Code merged into the branch still requires tests, operational evidence, and the acceptance criteria named in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Current priority: private-beta path

The intended beta path is one hash-map practice activity: start as a guest or sign in, write pseudocode, save and resume it, submit an evaluation, review deterministic feedback, and optionally unlock the TypeScript workspace.

Implemented foundations:

- Practice-session APIs, local/offline draft persistence, deterministic rubric feedback, and coding unlock.
- Durable evaluation-job storage, polling/cancellation contracts, worker trigger/worker code, retry and dead-letter state, queue health, and quality fixtures/metrics.
- Appeals, second-pass triage, reviewer resolution, and appeal audit records.
- Evaluation safety boundaries: AI kill switch, redaction, schema validation, timeout, and conservative evidence merge.

Still required before a private beta can be claimed:

- Deploy hosted PostgreSQL, authentication/session configuration, environment secrets, migrations, seed content, and a worker/queue runtime.
- Make the durable evaluation path the verified production path; prove retry, recovery, cancellation, and dead-letter behavior against staging infrastructure.
- Complete the learner-facing resilience path: saved/conflict/retry states, duplicate-submission protection, and usable evaluation-progress/failure states.
- Add and verify error tracking, correlation IDs, rate limits, backups, health checks, alerts, and rollback/failed-job runbooks.
- Run clean-database migration, API, browser, accessibility, queue-failure, backup/restore, and invited-user beta evidence.

## Work already present from later phases

### Phase 0 — foundations

Present: external-service kill switches and managed queue infrastructure foundations.

Remaining: reproducible hosted environments, complete observability/feature-flag rollout, and the phase exit evidence.

### Phase 1 — persistent vertical slice

Present: practice-session, revision, history, evaluation, completion, guest-related, and autosave foundations.

Remaining: prove cross-device signed-in resume, guest-to-account upgrade, ownership/conflict behavior, database integration coverage, and backup/restore.

### Phase 2 — pseudocode platform

Present: AST, parser, static-analysis, rubric-versioning, classifier, migration, and initial content foundations.

Remaining: complete authored-content expansion, Blockly adapter/product experience, and phase-level accessibility and migration evidence.

### Phase 3 — evaluation platform

Present: deterministic evaluation, job and worker foundations, appeal workflow, gold-set fixtures, quality metrics, AI gateway safeguards, and evaluator kill switch.

Remaining: staging/production worker operations, trace execution limits with seeded counterexamples, expert threshold evidence, cost/latency measurement, and outage/kill-switch drills.

### Phase 4 — learning, mastery, and personalization

Present: concept graph, mastery-update foundation, recommendations, spaced-review scheduling, onboarding-plan/personalization storage, and learner-profile API. An onboarding UI is currently being worked on in the shared worktree.

Remaining: complete onboarding and diagnostic flow, daily home/history/notes/concept-map learner surfaces, stored recommendation outcomes, and pilot evidence for the phase exit criteria.

### Phase 5 — safe coding workspace

Present: execution contracts, job storage/store, worker, submission/status/cancellation APIs, cancellation/editor UI, result mapping, Judge0 adapter, and execution policy.

Remaining: select and independently review the production sandbox provider; deploy isolated workers/queues; validate limits, quotas, abuse controls, outage behavior, and hidden/public test handling; complete plan-versus-code feedback.

### Phase 6 — content operations, administration, and support

Present: content validation/lifecycle workflow and administration authorization foundations.

Remaining: production author/review/publish workflow, operations queues, privileged-action audit controls, support/privacy/legal workflows, and rollback exercises.

### Phase 7 — mobile continuity and notifications

Present: PWA metadata/offline page, offline revision queue, and notification-preference scheduling foundations.

Remaining: install/update behavior, conflict-safe reconnect experience, notification delivery/consent/quiet-hours verification, device accessibility tests, and the native-app decision.

### Phase 8 — system-design learning

Present: system-design document model and staged-practice flow.

Remaining: accessible diagram canvas and semantic alternative, rubric evaluation, original case studies, and expert/accessibility validation.

### Phase 9 — public-release hardening

Present: account-lifecycle contracts/storage and release-readiness checklist.

Remaining: self-service privacy lifecycle, SLOs/alerts/recovery drills, security and abuse readiness, release governance, and public documentation.

## Branch-management note

The Phase 3 integration branch contains foundations from Phases 0 and 4–9. Keep those changes behind their relevant feature flags and do not treat their presence in the branch as permission to expose them in the private beta. Before opening or updating a PR to `main`, reconcile the branch with the current `origin/main`, keep unrelated future-phase changes separately reviewable where possible, and re-run the applicable checks.

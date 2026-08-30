# Implementation status notes

Snapshot: `main` after the Supabase/Vercel integration. This is an implementation ledger, not a declaration that any phase has passed its exit criteria. Code still requires tests, operational evidence, and the acceptance criteria named in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Current priority: private-beta path

The intended beta path is one hash-map practice activity: start as a guest or sign in, write pseudocode, save and resume it, submit an evaluation, review deterministic feedback, and optionally unlock the TypeScript workspace.

Implemented foundations:

- Practice-session APIs, local/offline draft persistence, deterministic rubric feedback, and coding unlock.
- Durable evaluation-job storage, polling/cancellation contracts, worker trigger/worker code, retry and dead-letter state, queue health, and quality fixtures/metrics.
- Appeals, second-pass triage, reviewer resolution, and appeal audit records.
- Evaluation safety boundaries: AI kill switch, redaction, schema validation, timeout, and conservative evidence merge.
- Request correlation, bounded in-process submission rate limits, evaluation/execution queue health, and stale-worker lease recovery.
- Supabase email/password Auth, server-side session refresh, durable Supabase Postgres persistence, curriculum seeds, guest continuity, notes/bookmarks, learner requests, and the study library are merged into `main`.

Still required before a private beta can be claimed:

- Configure the Supabase production project and Vercel environment secrets; apply all migrations, including curriculum, guest continuity, and learner requests.
- Make the durable evaluation path the verified production path; prove retry, recovery, cancellation, and dead-letter behavior against staging infrastructure.
- Verify learner resilience end-to-end: the UI now exposes evaluation progress, cancellation, retry/backoff, and a labeled local fallback, but needs browser/staging evidence for save conflicts and duplicate submission behavior.
- Add and verify structured error tracking, distributed rate limits, database backups, alerts, and rollback/failed-job runbooks. Correlation IDs, bounded in-process rate limits, queue health, and stale-job recovery are present in code.
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

Present: concept graph, mastery-update foundation, recommendations, spaced-review scheduling, onboarding-plan/personalization storage, learner-profile API, onboarding UI, and a profile-derived learner-plan API/page awaiting merge.

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

Present: account-lifecycle contracts, durable request storage, authenticated self-service export/deletion request intake, and release-readiness checklist.

Remaining: export artifact generation/download expiry, deletion execution/provider-device propagation, consent history, SLOs/alerts/recovery drills, security and abuse readiness, release governance, and public documentation.

## Branch-management note

`main` is the deployable integration branch. Keep unfinished AI, code execution,
notifications, and future curriculum behind their feature flags. Before opening
any PR, reconcile with `origin/main`, keep one roadmap work package per branch,
and re-run the applicable checks.

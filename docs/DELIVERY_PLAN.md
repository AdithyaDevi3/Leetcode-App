# Delivery and personalization plan

This document is the active execution plan. It narrows the broader product roadmap into dependency-ordered gates. A later gate may be researched behind a disabled flag, but it may not affect learners until every preceding production gate has evidence.

## Delivery principles

- Complete vertical learner journeys before expanding feature breadth.
- One coherent outcome per branch and pull request.
- Code merged is not code proven: acceptance requires automated and operational evidence.
- Use deterministic, explainable behavior as the production fallback for evaluators and personalization.
- Optimize learning outcomes and learner well-being, not time in app, clicks, or streak length.

## Current execution state — 2026-09-01

| Work | State | Evidence and next decision |
| --- | --- | --- |
| Deployed baseline | `origin/main` at `837fd52`; deployed, not yet proven by the new browser gate | Do not call the learner journey release-ready until the CI stack lands and passes on `main`. |
| Supabase content identity | PR [#50](https://github.com/AdithyaDevi3/Leetcode-App/pull/50) open | Rebase after the delivery stack, resolve overlap with the database corrections, and require the Slice 1B proof before merge. |
| Database integrity | Validated locally at `8d59662`; PR publication pending | 32/32 database tests and database TypeScript validation pass. Merge only after hosted CI repeats the result. |
| Observability dependency | Validated locally at `14858dc`; PR publication pending | Direct metrics SDK dependency and frozen lockfile are present. Merge only after hosted CI. |
| Truthful CI and browser gate | Validated locally at `89950d2`; PR publication pending | The complete non-mutating `pnpm preflight` passes, including 7/7 Playwright journeys against an isolated production server. Hosted checks remain required. |
| Workspace cleanup | Complete for this session | Reduced eight worktrees to three; removed 96 merged local branches and 33 merged remote branches while preserving dirty and unmerged work. |

This snapshot must be updated in the PR that changes any listed fact. Local or pending work must name a commit; merged and production claims require a linked check, artifact, probe, or PR.

## Workspace and branch hygiene

Keep the workspace small enough that branch state is obvious:

- Maintain at most four worktrees: the protected primary checkout, one integration/review tree, and at most two active implementation slices.
- A local branch must correspond to `main`, an open PR, or work actively being implemented. Delete merged local branches and their clean worktrees immediately after merge.
- Delete merged remote branches after confirming no open PR uses them. Preserve dirty, unpushed, unmerged, detached-unique, and incident/rollback branches until their owner explicitly resolves them.
- Start every slice from the latest `origin/main`. Stacked PRs are allowed only when dependencies are explicit in the PR body and the base is changed back to `main` after its prerequisite merges.
- Run a workspace audit at the start and end of each delivery session: fetch/prune, list worktrees, list dirty state, compare branches to `origin/main`, and reconcile open PRs.
- Add an automated, read-only `workspace:audit` command that fails when worktree limits, stale merged branches, missing upstreams, or undocumented stacked dependencies are detected. Cleanup remains an explicit human-reviewed action.

## Gate 0: trustworthy delivery

Outcome: every merge is independently reviewable and protected by truthful CI.

Required evidence:

- Protected `main` branch with pull requests, approval, current branches, resolved conversations, and required checks.
- Frozen dependency installation, lint, explicit typecheck, all workspace tests, production build, and evaluation-quality checks.
- Critical-path browser tests with failure traces and screenshots.
- Migration, repository integration, RLS/ownership, accessibility, and security checks added as their boundaries enter the active journey.
- Root `AGENTS.md`, current PR template, and status/requirements updates enforced during review.

`main` is not currently protected. After the CI PR lands, the repository maintainer must enable a branch ruleset requiring pull requests, one approval, the branch to be current, resolved conversations, and the `quality`, `browser`, and `evaluation-quality` checks. Direct pushes and bypasses must be disabled. Record the ruleset URL or screenshot in the Gate 0 evidence; until then, branch protection is an open Gate 0 requirement, not a completed control.

## Gate 1: reliable end-to-end learner loop

Outcome: a guest or signed-in learner can start, save, resume, evaluate, complete, and review practice without losing or duplicating work.

Deliver in order:

1. Align every visible content identifier with a published database content version.
2. Hydrate the workspace from the server and support exact cross-device/deep-linked resume.
3. Add atomic autosave with expected revisions, idempotency, ordered retry, and actionable conflict resolution.
4. Persist pseudocode-only and coding completion and prove guest-to-account upgrade behavior.
5. Flush the latest revision before evaluation and make durable job retry, cancellation, stale-lease recovery, and dead-letter behavior operable.
6. Move authenticated onboarding, plan, dashboard, settings, history, and practice surfaces from local substitutes to owned server state.
7. Record staging migration, browser, accessibility, worker-failure, alert, backup/restore, and rollback evidence.

Exit criteria:

- The release checklist is evidenced for the private-beta journey.
- Production monitoring covers save success, evaluation success, queue age, API errors, and latency.
- A release rollback and a database restore have been rehearsed.

## Gate 1 functional implementation slices

Each slice is a vertical change with a user-visible outcome. Its PR must include the API/data contract, failure behavior, telemetry, migration impact, tests, and rollback. No slice may be called complete because a component renders or an endpoint exists.

| Slice | Functional implementation | Required proof | Merge decision |
| --- | --- | --- | --- |
| 1A. Browser-ready workspace | Treat the existing `Ready` status as the client-ready signal, prevent pre-hydration input loss by withholding browser interaction until it appears, and assert local/offline/server/conflict status against current behavior. Playwright owns an isolated production-built server rather than reusing an unrelated development process. | All critical Playwright journeys green with trace/screenshot artifacts on failure; no console or hydration errors. | Validated locally in the pending CI stack; hosted CI evidence blocks every later Gate 1 slice. |
| 1B. Content identity | Use one immutable content/version identity from published curriculum through UI, session creation, revisions, evaluation, history, and analytics. Reject unknown/unpublished IDs with a typed error. | Migration test, repository integration test, API contract test, and browser start-session test on seeded content. | PR #50 may satisfy part of this only after rebase and evidence review. |
| 1C. Session bootstrap and hydration | `POST /api/practice/sessions` returns an existing resumable session or creates one idempotently; `GET /api/practice/sessions/:id` returns owned state and latest revision. The workspace loads server state before accepting edits and deep links resume the exact content/version. | Guest and account tests; cross-browser/device resume; ownership denial; empty/corrupt/stale-state behavior; hydration latency metric. | No autosave work merges until the read model is authoritative. |
| 1D. Atomic autosave and conflict recovery | Persist the session snapshot and revision in one transaction using `expectedRevision` and an idempotency key. Queue one ordered client save at a time, retry safely, and present server/local comparison with explicit resolution. | Concurrent-write integration tests, duplicate/retry tests, offline/reconnect browser test, real 409 conflict browser test, save success/error/latency telemetry. | Reject if any path silently overwrites newer work. |
| 1E. Evaluation handoff | Flush and acknowledge the latest revision before enqueueing evaluation. Bind a job to session/revision/rubric versions and make submit idempotent. Worker claims use leases, bounded retries, stale-lease recovery, cancellation, and dead-letter visibility. | Revision-race test, queue integration tests, worker crash/recovery test, local fallback test, staging failure injection, queue-age and failure alerts. | Reject if feedback can describe a stale draft or a job can disappear. |
| 1F. Completion, history, and upgrade | Complete pseudocode-only or code paths in a transaction, project history from durable events, and transfer guest-owned sessions exactly once during account upgrade. | Double-submit, partial-failure, guest upgrade, ownership, history ordering, and browser completion/resume tests. | Reject if completion exists only in local storage or transfer can duplicate work. |
| 1G. Account-owned surfaces | Replace local substitutes on onboarding, learning plan, dashboard, settings, history, notes/bookmarks, and notification preferences with authenticated repositories and explicit loading/error/empty states. | API ownership tests, reload/cross-device browser tests, accessibility checks, deletion/export propagation tests. | Deliver one surface per PR when independently usable. |
| 1H. Production operations | Add readiness probes for database and workers, end-to-end synthetic checks, SLO dashboards, alerts, backup/restore evidence, feature kill switches, and deployment rollback instructions. | Staging drill artifacts and a signed release checklist with named owner and rollback commit/version. | Required before private-beta expansion. |

The immediate implementation order is 1A → rebase/review PR #50 as 1B → 1C → 1D → 1E → 1F. Slices 1G can follow behind 1F one surface at a time; 1H begins with telemetry in every slice and closes the gate.

## Gate 2: trustworthy learning data

Outcome: the platform records consent-aware, versioned data that can reproduce mastery and recommendation decisions.

Deliver:

- Versioned concepts, prerequisites, activity mappings, and difficulty metadata.
- Append-only mastery evidence with algorithm version, prior state, new state, and explanation.
- Recommendation decisions containing the complete candidate set, exclusions, factors, scores, position, chosen item, and policy/model version.
- Idempotent impressions and outcomes for start, skip, override, completion, evaluation, hints, retries, abandonment, and delayed transfer.
- Stable experiment assignment and recorded propensity before any randomized exploration.
- Schema versions, occurred/received timestamps, idempotency keys, allowlisted payloads, and data-quality counters.
- Enforced personalization opt-out, retention, export, and deletion behavior for raw and derived data.

Do not reconstruct historical impressions from activity history; past data does not identify what the learner was shown.

## Personalization functional implementation slices

| Slice | Functional implementation | Decision gate |
| --- | --- | --- |
| 2A. Concept graph | Version concept nodes, prerequisite edges, content mappings, difficulty, estimated time, and publication state. Validate cycles and orphaned published content. | No recommendation candidate generation until graph validation is green. |
| 2B. Evidence ledger | Append immutable evaluation/completion/hint/retry evidence with source and algorithm version; build a replayable mastery projector. | Replaying the same ledger must produce the same mastery state and explanation. |
| 2C. Decision ledger | Persist eligible candidates, exclusions, factor values, scores, rank, selected item, policy/model version, and explanation before rendering. | A recommendation must be exactly reproducible from recorded inputs and versioned code. |
| 2D. Outcomes and consent | Record idempotent impression/start/skip/override/completion/delayed-transfer outcomes with occurred/received time, experiment assignment, propensity, consent state, retention, export, and deletion propagation. | 100% opt-out enforcement and greater than 99% joinability before experimentation. |
| 3A. Rules ranker | Candidate filters plus mastery gap, review due, goal, challenge, duration, repetition, diversity, and overload scoring; return alternatives and explanations. | Becomes the permanent fallback and the baseline every model must beat. |
| 4A. Dataset builder | Produce immutable, time-bounded, consent-filtered datasets with learner-separated temporal splits, leakage tests, schema checksum, and lineage. | Data review approval is required before any training job. |
| 4B. Interpretable baselines | Compare weighted mastery, BKT/IRT, logistic ranking, and boosted trees using delayed transfer as the primary metric. | Stop if no baseline beats the rules ranker with acceptable calibration and subgroup outcomes. |
| 5A. Neural ranker | Train a small two-tower/cross-feature multi-task ranker without identity or raw-text features; register artifact, schema, checksum, source commit, evaluation, and model card. | Remains offline until published readiness thresholds and power analysis pass. |
| 6A. Shadow and canary | Shadow score, compare rules/model decisions, enforce current policy at request time, add timeout/circuit-breaker/fallback, then use stable staff/1%/5%/20%/50% cohorts. | Each promotion is a recorded human decision; regressions or guardrail breaches roll back automatically to pinned rules. |

## Gate 3: deterministic personalization baseline

Outcome: a production rules ranker recommends safe, explainable activities and provides the benchmark for ML.

The ranker must:

- Generate only published and prerequisite-valid candidates.
- Score mastery gap, review due, goal relevance, challenge, duration, repetition, diversity, and overload.
- Persist factors, alternatives, exclusions, the selected activity, and a learner-facing explanation.
- Support `too easy`, `too hard`, `not relevant`, and alternate-activity feedback.
- Give opted-out learners a curated non-personalized path.
- Remain available as the fallback for every later model.

## Gate 4: offline ML baselines

Outcome: reproducible offline evaluation establishes whether learned personalization adds value.

Evaluate the weighted mastery model, Bayesian Knowledge Tracing or Item Response Theory, logistic ranking, and gradient-boosted ranking before a neural model. Use immutable time-bounded datasets, temporal and learner-separated splits, consent filters, artifact lineage, and leakage tests.

The primary success signal is delayed transfer performance on a different, previously unseen activity sharing the target concept. Completion, first-attempt performance, mastery change, hint/retry burden, override, and abandonment are secondary outcomes.

## Gate 5: constrained neural learning-to-rank

Outcome: a neural ranker improves learning outcomes without bypassing deterministic policy.

Initial architecture:

- Small learner/context and content/concept towers with a cross-feature MLP.
- No raw user-identity embedding in version one.
- Multi-task predictions for start, completion, first-attempt performance, delayed transfer gain, and overload risk.
- Deterministic prerequisite, availability, diversity, privacy, and safety constraints applied before and after scoring.

Never use email, name, device fingerprint, raw user ID, raw pseudocode/code, notes, appeal/reflection text, accessibility notes, support data, or information unavailable at scoring time for the decision being evaluated, including outcomes caused by that recommendation, as model features.

Readiness thresholds require a formal power analysis. The initial planning assumptions are 30-50 validated activities across at least 10 concepts, about 5,000 consenting learners, about 100,000 valid impressions, at least 10,000 mature outcomes, greater than 99% critical-field completeness and decision/outcome joinability, less than 0.1% duplicates, 100% opt-out enforcement, and at least four weeks of stable collection.

Before training begins, the named ML owner, product owner, and privacy/security reviewer must approve a versioned evaluation protocol and ADR. It must preregister the minimum worthwhile effect and 95% uncertainty interval, calibration limits, minimum subgroup sample sizes and suppression rules, latency and error budgets, guardrails, and automatic stop/rollback thresholds. No offline model advances to shadow, and no shadow model advances to canary, without a signed decision against that protocol.

If these gates are not met, keep the neural model offline or in shadow mode.

## Gate 6: shadow, experiment, and rollout

Outcome: model promotion is evidence-based and reversible.

1. Register an immutable artifact with checksum, training snapshot, feature schema, source commit, evaluation report, and model card.
2. Batch-score in shadow mode without changing learner responses.
3. Review calibration, delayed transfer, overload, diversity, subgroup outcomes, latency, errors, and rules disagreement.
4. Progress through staff, 1%, 5%, 20%, and 50% stable user-level cohorts only after a recorded review at each gate.
5. Reapply current policy at request time and fall back to rules on missing, stale, invalid, timed-out, or disabled model results.
6. Support immediate kill switch and rollback to a pinned rules or model version. Never auto-promote a retrained model.

## Pull-request train

Each item is a separate reviewable PR unless its acceptance criteria cannot operate independently:

1. Isolated database integration and legacy repository contract corrections.
2. Complete workspace runtime dependency declarations.
3. Browser-ready workspace and truthful CI for every PR base, with current critical-path Playwright tests.
4. Delivery rules, roadmap, PR evidence contract, and workspace lifecycle policy, stacked on the truthful CI change so its required preflight is non-mutating.
5. Read-only `workspace:audit` automation.
6. Content identity contract and clean migration proof.
7. Server hydration and cross-device resume.
8. Atomic autosave, idempotency, and conflict resolution.
9. Durable evaluation operations and staging failure injection.
10. Durable completion, history, and guest upgrade.
11. Authenticated account surfaces, one vertical surface per PR.
12. Release evidence, observability, backup/restore, and rollback.
13. Versioned concepts and prerequisite persistence.
14. Mastery evidence and reproducible projector.
15. Recommendation decision, impression, and outcome contracts.
16. Consent-aware journey instrumentation and data-quality monitoring.
17. Deterministic ranker, explanations, overrides, and opt-out journey.
18. Experiment assignment and immutable offline dataset builder.
19. Interpretable baseline evaluation report.
20. Neural training package, reproducible artifact, and model card.
21. Shadow serving, registry, timeout, circuit breaker, and fallback.
22. Canary result and explicit promote-or-reject decision.

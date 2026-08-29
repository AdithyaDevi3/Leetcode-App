# Phase 3 implementation record

Branch: `phase-3-evaluation-platform`

The evaluation path is intentionally split into these boundaries:

1. `POST /api/practice/sessions/:sessionId/evaluate` accepts an idempotent revision request and returns `202` plus `jobId`.
2. `GET` and `DELETE /api/practice/sessions/:sessionId/evaluate/:jobId` poll or cancel an owned job.
3. `evaluation-jobs.ts` owns retry state, dead-letter state, idempotency, cancellation, and queue-age metrics.
4. `ai-gateway.ts` is the provider boundary. It redacts input, applies a timeout, validates the result schema, and is disabled by default through `ai-evaluation`.
5. `evaluation-merge.ts` combines evidence. Deterministic contradictions prevent approval; AI findings are actionable only when grounded by a source span or node ID.

Implemented slices:

- Versioned rubric/classifier baseline.
- Idempotent evaluation jobs with polling and cancellation.
- Retry accounting, dead-letter marking, and queue metrics.
- Provider-neutral AI result validation, redaction, timeout, and kill switch.
- Conservative deterministic/AI evidence merge.
- Learner appeals with second-pass-ready status, reviewer resolution, and immutable audit events.

Still required before the Phase 3 exit criteria can be claimed:

- Persistent queue/worker adapter and production metrics export.
- Trace execution with resource limits and seeded counterexamples.
- Appeal persistence, second-pass policy, reviewer queue, and immutable audit events.
- Gold submissions, expert thresholds, latency/cost measurement, and staging outage/kill-switch evidence.

Do not mark Phase 3 complete until those operational and expert-validation items are evidenced.

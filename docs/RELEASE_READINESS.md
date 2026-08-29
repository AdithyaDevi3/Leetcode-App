# Release readiness checklist

Use this checklist for the private beta and repeat it before each production release.

## Build and data

- [ ] Clean install, lockfile check, typecheck, lint, unit tests, and production build pass.
- [ ] Staging uses the same migration set and runtime configuration shape as production.
- [ ] Migrations are applied forward successfully against an empty database and a copy of production data.
- [ ] Seed content is versioned, reviewed, and verified.
- [ ] Backup restore has been rehearsed and the recovery owner is recorded.

## Runtime and safety

- [ ] Authentication/session secrets are production-only and never public.
- [ ] Object ownership and guest/account boundaries pass API tests.
- [ ] Evaluation jobs use durable storage, bounded retries, cancellation, and dead-letter handling.
- [ ] Rate limits, request correlation IDs, error tracking, health checks, and queue-age alerts are active.
- [ ] AI and code execution remain disabled unless their safety, budget, timeout, and rollback checks pass.

## User journey

- [ ] Sign-in/guest start, save, refresh, resume, evaluate, poll, complete, and coding unlock work in staging.
- [ ] Duplicate submissions are idempotent and transient failures have a visible recovery path.
- [ ] Keyboard navigation, screen-reader announcements, contrast, and 320px reflow pass.
- [ ] Smoke test is recorded against the release commit.

## Release and rollback

- [ ] Release commit, migration version, content version, rubric version, and configuration are recorded.
- [ ] Rollback owner and rollback command/runbook are documented.
- [ ] Post-release monitoring window and escalation contacts are scheduled.
- [ ] Beta feedback is triaged by data safety, correctness, accessibility, and core-flow impact.

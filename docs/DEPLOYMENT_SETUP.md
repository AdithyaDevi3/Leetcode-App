# External deployment setup

This document lists work that happens **outside this repository** when the
application is deployed. It is a launch checklist, not an implementation
roadmap: do not commit provider credentials, production data, generated
certificates, or environment state.

The current web deployment target is Vercel with `apps/web` as the project
root. A different host is acceptable only if it provides the same server-side
environment variables, background-worker execution, protected secrets, logs,
and health checks.

## What deployment owns

| Area | Required for an invited beta | Deployment-time action | Repository boundary |
|---|---|---|---|
| Hosting and domain | Yes | Create Vercel project, configure preview/staging/production domains and HTTPS, set `NEXT_PUBLIC_APP_URL` per environment | No provider/project configuration is committed |
| Database | Yes | Provision managed PostgreSQL, restrict network access, create separate staging/production databases, run forward migrations, schedule backups and restore tests | Connection settings are server secrets; migrations are versioned here |
| Authentication | Yes for saved data | Create OAuth applications, set exact callback URLs for each environment, generate `AUTH_SECRET`, and restrict approved redirect origins | Only provider identifiers/secret names belong in configuration; no OAuth secret is committed |
| Evaluation worker | Yes when `EVALUATION_JOB_STORE=postgres` | Deploy an authenticated worker/scheduler, provide `EVALUATION_WORKER_TOKEN`, and monitor queue age, stale leases, retries, and dead letters | Worker contracts and health endpoints live here; scheduling credentials do not |
| Observability | Yes | Connect error tracking, central logs, uptime/health checks, request-correlation search, and alerts for failures, queue age, latency, and database capacity | Never send raw submissions, prompts, tokens, or user emails by default |
| Backups and recovery | Yes | Set retention, encrypt backups, run a staging restore, define rollback owner and incident contacts | Do not commit snapshots or production exports |
| Rate limiting | Yes | Configure a distributed limiter or edge policy before public access; set abuse thresholds and alerts | In-process limits are only a fallback, not production enforcement |

## Features that remain disabled until separately provisioned

These integrations are intentionally **not** activated just because code or an
environment variable exists. Enable each only after its service is isolated,
credentialed, monitored, and tested in staging.

| Integration | Default | Enable only after |
|---|---|---|
| Code execution / Judge0 | `CODE_EXECUTION_ENABLED=false` | An isolated Judge0 deployment, server-only `JUDGE0_TOKEN`, worker runtime, execution limits, abuse controls, outage behavior, and sandbox security review are complete |
| AI evaluation provider | Adapter/fallback only | Server-only provider key, cost budget, quotas, redaction policy, evaluator quality checks, and provider outage fallback are verified |
| Email and push notifications | Not a launch dependency | Sender/domain verification, unsubscribe handling, consent records, delivery monitoring, frequency caps, and notification worker are live |
| Object storage | Not a launch dependency | Private bucket/container, encryption, lifecycle rules, signed access policy, and deletion/retention behavior are tested |

## Required server environment variables

Use `apps/web/.env.example` as the canonical variable-name list. Set values in
the deployment platform's secret manager for each environment; do not copy a
local `.env` file into hosting configuration.

Minimum beta configuration:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, and/or `AUTH_GITHUB_ID` and
  `AUTH_GITHUB_SECRET`
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`
- `NEXT_PUBLIC_APP_URL`
- `EVALUATION_JOB_STORE=postgres`
- `EVALUATION_WORKER_TOKEN` and `EVALUATION_REVIEWER_TOKEN`
- queue age, stale-job, and submission-limit values appropriate to the beta

Keep `CODE_EXECUTION_ENABLED=false` unless the execution prerequisites above
are complete. `JUDGE0_TOKEN`, AI provider keys, email keys, object-storage
credentials, database passwords, and worker tokens must never have a
`NEXT_PUBLIC_` prefix.

## Safe launch order

1. Create isolated preview, staging, and production environments with no
   shared credentials or data.
2. Provision PostgreSQL, apply migrations to a clean staging database, seed
   approved content, and prove backup restore.
3. Configure OAuth callback URLs and secrets; confirm sign-in, sign-out,
   session expiry, and account ownership in staging.
4. Deploy the web service and the evaluation worker; exercise queued,
   canceled, failed, retried, and stale-job recovery paths.
5. Turn on logs, error tracking, health checks, database/queue alerts, and a
   rollback runbook before inviting users.
6. Run browser smoke tests and a small invited beta. Only then consider
   enabling execution, AI, email, push, or storage integrations.

## Evidence required before public access

- Staging migration and rollback/forward-fix rehearsal.
- Successful backup restore rehearsal.
- OAuth and authorization smoke tests using non-production accounts.
- Worker failure-injection evidence, including queue-age alert delivery.
- Error/latency/rate-limit dashboards with named responders.
- Accessibility and browser smoke checks for the learner path.
- Written incident, privacy/deletion, and provider-outage runbooks.

For implementation status and launch blockers, see
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and
[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). For local developer
setup, see [DEVELOPMENT.md](DEVELOPMENT.md).

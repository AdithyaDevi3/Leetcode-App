# Maintainer Quick Start

This is the practical starting point for taking over Method. It describes the
deployed application as of 2026-09-28, where common changes belong, and the
shortest safe path to the first administration console.

## Ten-minute orientation

1. Run the app locally using the commands below.
2. Open `/practice` and complete `Pair With Target` as a guest.
3. Read [the current architecture](ARCHITECTURE.md), then review
   [ADR-011](adr/011-current-platform-and-admin-console.md).
4. Before changing code, search for an existing route, domain rule, migration,
   and test that already owns the behavior.
5. Make one focused branch and pull request, run `pnpm preflight`, and merge
   only after CI and the Vercel preview pass.

Production: <https://corsair-tech-leetbot.vercel.app>

Some managed networks return `NXDOMAIN` for every `*.vercel.app` address. If
public DNS resolves the hostname but a local network does not, use another
network or a permitted VPN. Changing application redirects cannot repair DNS.

## What works today

| Area | Current behavior | Main code |
|---|---|---|
| Navigation | Home, roadmap, onboarding, dashboard, learn, library, practice, history, requests, settings, system design, and auth routes render with shared responsive navigation | `apps/web/src/app`, `apps/web/src/components/site-navigation.tsx` |
| Practice | Ten original activities support structured-English and block-style pseudocode, optional reference-answer comparison, drafts, staged progress, history, and deterministic feedback | `apps/web/src/lib/content.ts`, `apps/web/src/components/practice-workspace.tsx` |
| Topic roadmap | Eight algorithm and eight system-design topics each provide foundation, intermediate, and advanced analysis questions; search, filters, and browser-local progress support browsing the 48-question catalog | `apps/web/src/app/roadmap`, `apps/web/src/lib/roadmap.ts`, `apps/web/src/lib/roadmap-evaluation.ts` |
| Code grading | Python 3, C++20, and TypeScript solutions run against server-owned tests; only an all-tests-passing report completes verified practice | `apps/web/src/lib/code-grading.ts`, `apps/web/src/app/api/practice/sessions/[sessionId]/verify/route.ts` |
| Isolation | Production code runs in ephemeral, network-denied Vercel Sandbox microVMs with runtime and output limits; Judge0 remains an optional self-hosted fallback | `apps/web/src/lib/sandbox` |
| Persistence | Supabase Postgres stores guest identities, sessions, revisions, evaluations, history, profiles, requests, notes, bookmarks, and queue records | `packages/database/migrations`, `apps/web/src/lib/practice-api.ts` |
| Authentication | Supabase email/password signup, confirmation, sign-in, sign-out, server session refresh, and guest-progress merge are implemented | `apps/web/src/app/auth`, `apps/web/src/lib/auth/session.ts`, `apps/web/src/middleware.ts` |
| Administration | A server-authorized portal exposes role-scoped overview, people, classes, content, operations, feedback, privacy, and audit views; role and class changes are audited | `apps/web/src/app/admin`, `apps/web/src/lib/admin`, `packages/database/src/repositories/administration.repository.ts` |
| Classes, submissions, and grades | Instructors create owner-scoped classes and assignments, review submissions, save private rubric drafts, publish grades, excuse or restore individual recipients with a reason, and inspect a published-only gradebook; learners join by code and see only their published scores, rubric breakdowns, feedback, and applicability | `apps/web/src/app/classes`, `apps/web/src/app/teach`, `packages/database/src/repositories/classroom.repository.ts`, `packages/database/src/repositories/gradebook.repository.ts` |
| Personalization | A deterministic policy ranks activities using goals, experience, weekly time, preferred language, history, review age, and concept mastery; no neural network is required | `apps/web/src/lib/local-learner.ts`, `apps/web/src/lib/local-mastery.ts` |
| Resilience | Health endpoints, request IDs, queue recovery foundations, CI/security scans, browser tests, and a build-independent offline fallback exist | `apps/web/src/app/api/health`, `apps/web/public/sw.js`, `.github/workflows` |

The application is usable for guest algorithm practice now. “Implemented” in
this table does not mean every launch control is complete.

## Known launch gaps

Address these in this order:

1. Verify the complete Supabase signup, email-confirmation, sign-in, and
   guest-to-account merge journey against production redirect allowlists.
2. Replace the shared appeal reviewer token with authenticated, reason-required
   administration actions from [ADR-011](adr/011-current-platform-and-admin-console.md).
3. Replace the in-memory limiter in `apps/web/src/lib/rate-limit.ts` with a
   distributed limiter shared by all Vercel instances.
4. Configure production error reporting, uptime checks, alerts, database
   backups, and a restore rehearsal.
5. Persist and reconcile mastery/recommendation outcomes across devices.
6. Move authored activities and grading specifications toward one versioned
   content source instead of parallel hardcoded definitions.
7. Remove the unused NextAuth adapter/configuration after confirming no data
   migration depends on its legacy tables.

AI evaluation is deliberately disabled by default. System-design drafts remain
local to one browser. Neither should be presented as a completed hosted feature.

## Local setup

Prerequisites are Node.js 24, pnpm 9-compatible tooling, Git, and Docker Desktop
when exercising database-backed paths.

```bash
git clone https://github.com/AdithyaDevi3/Leetcode-App.git
cd Leetcode-App
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm db:bootstrap
pnpm dev
```

Open <http://localhost:3000>. The UI supports guest exploration without signing
in, but durable API and auth testing require the documented database and
Supabase variables. Use placeholders locally and deployment-managed secrets in
Vercel; never commit real values.

Run the full release gate before every pull request:

```bash
pnpm preflight
```

For a fast feedback loop:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

## Where to make common changes

### Add or change a practice activity

1. Edit the authored learner-facing activity in `apps/web/src/lib/content.ts`.
2. Add or update the server-owned grading specification in
   `apps/web/src/lib/code-grading.ts`.
3. Keep the stable slug mapped to a database content UUID through a new
   `packages/database/migrations/*` migration; never change a published ID.
4. Update deterministic rubric/evaluator coverage where the expected reasoning
   changes.
5. Add tests for correct, incorrect, edge-case, and timeout behavior.

### Change recommendations

Edit the versioned weights and explanations in
`apps/web/src/lib/local-learner.ts`. Mastery evidence lives in
`apps/web/src/lib/local-mastery.ts`. Keep the decision explainable, bump the
policy version when stored outcomes change, and test ordering plus boundary
cases. A neural network is not part of the current architecture.

### Change a page or route

Pages live under `apps/web/src/app`; reusable UI lives under
`apps/web/src/components`. Use `Link` for internal navigation, preserve keyboard
and narrow-screen behavior, and add or extend browser coverage for a user
journey. API routes must validate input and authorize the concrete object, not
only check that some session exists.

### Change the database

The repository uses imperative `node-pg-migrate` migrations in
`packages/database/migrations`:

```bash
pnpm --filter @leetcode-app/database migrate:create descriptive-name
pnpm db:bootstrap
pnpm --filter @leetcode-app/database test
```

Use a new forward migration. Do not edit a migration already applied outside
your local environment. Enable RLS on every table exposed through the Supabase
Data API and write ownership or permission policies explicitly.

The gradebook storage foundation adds migration
`1790363936520_gradebook-storage.ts`. Apply it before enabling any code that calls
`PostgresGradebookRepository`. It adds five server-only tables and copies no
legacy practice data. Instructor submission, manual-grading, and class-gradebook
screens call it through owner-scoped server routes; learner submission and grade
views use recipient-scoped reads that exclude drafts and private notes.
Verify RLS and revoked browser-role privileges after migration. Roll back an
application release by leaving the additive tables in place; the migration's
down operation drops grade history and is only appropriate for disposable test
databases. Use a forward fix once real grades exist.

Migration `1790543189816_assignment-verification-jobs.ts` adds the assignment-only
verification queue and system-grade provenance. Apply it before running an
assignment verification worker. Queue failures and malformed verifier output must
be recorded as unavailable and must not create a zero. Keep hidden tests and raw
sandbox output out of HTTP responses and routine logs. The generic practice
execution worker is not a grade source.

`apps/web/src/workers/verification-worker.ts` claims pinned assignment jobs,
runs each pinned test through the configured sandbox, and resolves a binary
pass/fail grade or marks the job unavailable for retry. Trigger it with an
authenticated `POST /api/internal/workers/verifications` request using
`VERIFICATION_WORKER_TOKEN`, the same pattern as the evaluation worker route.
Set `VERIFICATION_QUEUE_MAX_AGE_MS` to the maximum acceptable delay for the
deployed scheduler cadence. `GET /api/health/verifications` returns aggregate
queue metrics and HTTP 503 when queued work exceeds that age or a running lease
has expired; it returns `disabled` without opening a database connection while
code execution is disabled. Alert on sustained 503 responses without exposing
the worker token or queue payloads.
The initial `stdin-stdout-v1` adapter supports one to five pinned cases with
bounded string `input` and `expected` fields. Any other verifier version or
malformed suite remains unavailable and cannot create a grade.
Learners submit supported source through
`POST /api/learner/assignments/{recipientId}/submissions`. The server resolves
the authenticated learner and pinned policy, generates the immutable response
revision, and returns `202` when verification is queued. Client-supplied owner,
policy, test, and evaluator identifiers are rejected.

The `Staging Verification Operations` GitHub Actions workflow currently runs an
isolated verification contract check every six hours and on manual dispatch.
It applies the real migration chain to disposable PostgreSQL, exercises queue
persistence, and verifies the worker and health-route contracts. This is the
free-tier interim mode: it catches code and migration regressions without
sharing production data, but it is not persistent-state, deployment, restore,
or end-to-end staging evidence.

Provisioning a distinct staging database is deferred until a second Supabase
project or equivalent isolated managed PostgreSQL target is available. Do not
point Preview or this workflow at the production database, and do not commit an
encrypted SQLite snapshot as a substitute: repository history, concurrent
writes, and ephemeral deployment filesystems make that unsafe and unreliable.

Once the isolated target exists, configure a GitHub environment
named `staging` with `STAGING_APP_URL` and
`STAGING_VERIFICATION_WORKER_TOKEN` secrets, then set the repository variable
`STAGING_VERIFICATION_AUTOMATION_ENABLED=true`. The URL must be an HTTPS
hostname containing `staging`; the workflow refuses any other target so it
cannot fall back to production. Scheduled runs claim at most one job and then
require the aggregate health endpoint to return `status: ok`. A failed worker
request, unhealthy queue, missing secret, or malformed response fails the run
and supplies alert evidence in GitHub Actions. Keep the variable disabled until
the staging deployment uses a distinct database and the assignment-verification
migration has been applied. After enabling it, use the manual `health-only`
operation to validate the remote alert path without invoking the worker.

Migration `1790971200000_gradebook-recipient-applicability.ts` adds immutable
assignment-applicability history. Each existing and new recipient starts with a
system-authored `assigned` revision. The class owner can append a reasoned
`excused` or restored `assigned` revision through the server boundary; retries
are idempotent and stale revisions conflict. Excusing a recipient supersedes any
queued or running verification job, blocks submissions and grading while the
excusal is current, and preserves attempts, grades, publications, and prior
applicability revisions for audit. Excused work is shown explicitly and omitted
from the learner's denominator, total, and comparable ranking set.

Migration `1791061200000_gradebook-dispute-events.ts` adds an immutable dispute
event chain for each assignment recipient. Repository callers can let the owning
learner submit or withdraw a review request and let the class owner mark it in
review or resolve it as upheld or changed. Every transition requires the expected
prior event and an idempotency key. A changed resolution must reference a newly
published replacement grade; the correction remains open until that explicit
resolution is appended. A new submission or recipient excusal automatically
supersedes an active dispute. While a dispute is active, projections preserve the
published score in the learner's total and coverage but exclude the learner from
comparable ranking. Learner reads remain recipient-scoped and expose public
messages without request keys, internal reasons, actor identities, or private
instructor notes. Authenticated learners use the published grade card at
`/classes/{classId}/grades` to open a review request with a trimmed 20–4,000
character reason, see its public status and response history, and withdraw an
active request after explicit confirmation. The recipient-scoped routes reject
unknown or unowned assignments as not found, malformed bodies as invalid, and
stale expected-event identifiers as a refresh-and-retry conflict. The instructor
workflow lists active requests at `/teach/{classId}/disputes` with new and
in-review filters. Its recipient detail screen lets the owning instructor append
an internal in-review note, then send the learner a written resolution that
either upholds the disputed grade or identifies a newer, already-published grade
as the changed outcome. Instructor routes use the same exact-body validation,
idempotency keys, and expected-event conflict protection; repository ownership
checks keep requests private to the class owner.

### Change authentication or administration

The active user-facing authentication path is Supabase Auth. Do not revive the
legacy NextAuth files. Read roles from server-controlled data—not editable user
metadata—and never expose a Supabase secret/service-role key to browser code.
Every admin mutation requires both server authorization and an audit event.

The administration portal lives at `/admin`. The first administrator is a
one-time operational bootstrap, and the target must already have a confirmed
Supabase Auth account:

```bash
pnpm admin:bootstrap -- owner@example.com "Initial project administrator"
```

The command refuses to run after an administrator exists. Its role assignment
and audit event use one database transaction. Subsequent role
changes belong in `/admin/users`, where the portal prevents removal of the final
administrator and records the actor, target, reason, request ID, and before/after
roles. Do not assign roles through signup, email-domain rules, `user_metadata`,
or browser storage.

Administrators create classes at `/admin/classes`. Each class has a server-generated
join code; share it with learners, who sign in and enter it at `/classes`. A code
enrolls the learner and reveals that class's assignments. Regular practice stays
available without a code. Administrators assign one existing practice activity
per class task, with an optional due date. A task is complete when the learner
has passed the activity's verified code tests, including completion achieved
before joining the class. Class creation and task assignment require an audit
reason. Instructor-owned classes also support a manual-grading workflow at
`/teach/{classId}/submissions`:
reviewed-rubric scores and feedback are saved as private drafts, then published
explicitly. `/teach/{classId}/gradebook` calculates published totals, coverage,
and comparable ranks. The class owner can excuse or restore an individual
recipient with a required reason; the gradebook excludes excused work from totals
and ranking while preserving all prior evidence. Active grade disputes preserve
the published total but temporarily exclude the learner from comparable ranking;
learners can open and withdraw those requests inline on the corresponding
published grade card and see the public request, status, and instructor response.
Learners use `/classes/{classId}/grades` to see only published scores, rubric
breakdowns, feedback, current applicability, and their own dispute details.
Class owners use `/teach/{classId}/disputes` to triage open requests and the
linked submission detail to mark a request in review or resolve it as upheld or
changed. Class editing, code rotation, archiving, and individual assignment
remain future work.

Before enabling this release in staging or production, apply migration
`1789932382585_classrooms-and-assignments.ts` to that environment's database and
verify the class pages with a non-production administrator and learner. The web
deployment must follow the migration so the new server queries have their tables
and indexes available.

### Instructor signup and local admin preview

Choose **Teach** on the account form, create an account, confirm your email,
and enable your instructor workspace. Existing learners can use **Instructor
workspace** in navigation to opt in. At `/teach`, instructors create classes
and join codes, assign practice, and view enrolled learners and completion.
They can also review the latest assignment submissions, save and publish manual
rubric grades, and inspect the class gradebook. Learners can open each enrolled
class's grade view from `/classes`; unpublished scores and private instructor
notes never appear there.
Each instructor can access only classes they created; platform administrator
permissions are granted separately. Instructor setup and class changes are
audited. This uses the existing user role and classroom ownership columns.

During `next dev`, `/admin-preview` shows an unauthenticated admin design
preview. Its class form uses sample data held in page memory; codes are not
valid enrollment codes, and reloading resets changes. The preview returns
not found outside development. Real `/admin` routes still require authorization.

### Change solution-language support

The learner workspace offers Python 3 first, C++20 second, and TypeScript as an
additional option. A language is complete only when the domain execution type,
API validation, starter generation, server-owned grading harness, Vercel
Sandbox command, Judge0 mapping, preferences, documentation, and tests agree.
Do not add a selector option before the corresponding isolated runtime and
hidden-test harness are available. Judge0 language IDs remain environment
overrides because self-hosted instances may expose different compiler sets.

### Change production behavior

Production deploys automatically from `main` to Vercel. Configuration belongs
in Vercel environment variables and Supabase project settings, not Git. After a
merge, confirm the deployment is `Ready`, probe `/api/health`, and exercise the
changed route. The canonical application URL is configured through
`NEXT_PUBLIC_APP_URL`.

## Safe handoff checklist

- Access: GitHub repository, Vercel project, and Supabase project are assigned
  to named people using individual accounts and least privilege.
- Secrets: no credentials are copied into documentation, chat, issues, or test
  fixtures; rotate credentials when an owner leaves.
- Releases: `main` stays deployable; changes use short-lived branches and one
  focused pull request.
- Data: migrations are forward-only, RLS is reviewed, and production data is
  never copied into local or preview environments.
- Operations: preserve request IDs in support reports and avoid logging learner
  code, pseudocode, emails, tokens, or prompts.
- Decisions: update this guide, architecture, and the relevant ADR whenever the
  deployed provider or trust boundary changes.

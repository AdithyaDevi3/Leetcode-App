# Maintainer Quick Start

This is the practical starting point for taking over Method. It describes the
deployed application as of 2026-09-14, where common changes belong, and the
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
| Practice | Ten original activities support structured-English and block-style pseudocode, drafts, staged progress, history, and deterministic feedback | `apps/web/src/lib/content.ts`, `apps/web/src/components/practice-workspace.tsx` |
| Topic roadmap | Eight algorithm and eight system-design topics each provide foundation, intermediate, and advanced analysis questions; search, filters, and browser-local progress support browsing the 48-question catalog | `apps/web/src/app/roadmap`, `apps/web/src/lib/roadmap.ts`, `apps/web/src/lib/roadmap-evaluation.ts` |
| Code grading | TypeScript and Python solutions run against server-owned tests; only an all-tests-passing report completes verified practice | `apps/web/src/lib/code-grading.ts`, `apps/web/src/app/api/practice/sessions/[sessionId]/verify/route.ts` |
| Isolation | Production code runs in ephemeral, network-denied Vercel Sandbox microVMs with runtime and output limits; Judge0 remains an optional self-hosted fallback | `apps/web/src/lib/sandbox` |
| Persistence | Supabase Postgres stores guest identities, sessions, revisions, evaluations, history, profiles, requests, notes, bookmarks, and queue records | `packages/database/migrations`, `apps/web/src/lib/practice-api.ts` |
| Authentication | Supabase email/password signup, confirmation, sign-in, sign-out, server session refresh, and guest-progress merge are implemented | `apps/web/src/app/auth`, `apps/web/src/lib/auth/session.ts`, `apps/web/src/middleware.ts` |
| Administration | A server-authorized portal exposes role-scoped overview, people, classes, content, operations, feedback, privacy, and audit views; role and class changes are audited | `apps/web/src/app/admin`, `apps/web/src/lib/admin`, `packages/database/src/repositories/administration.repository.ts` |
| Classes and tasks | Administrators create class codes and assign existing practice activities; signed-in learners join classes and see task progress from verified practice completion | `apps/web/src/app/classes`, `apps/web/src/app/admin/classes`, `packages/database/src/repositories/classroom.repository.ts` |
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

The command refuses to run after an administrator exists. Subsequent role
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
reason. Class editing, code rotation, individual assignment, and manual grading
are not part of this release.

Before enabling this release in staging or production, apply migration
`1789932382585_classrooms-and-assignments.ts` to that environment's database and
verify the class pages with a non-production administrator and learner. The web
deployment must follow the migration so the new server queries have their tables
and indexes available.

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

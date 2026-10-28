# Usage

This guide describes current application behavior. Development requirements and
release rules are in [conventions](CONVENTIONS.md); trust boundaries are in
[architecture](ARCHITECTURE.md).

## Local setup

Use Node.js 24, pnpm 9-compatible tooling, Git, and Docker for persistence tests.
Run these commands from the repository root:

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm db:bootstrap
pnpm dev
```

Open <http://localhost:3000>. The example file supplies local PostgreSQL settings;
configure its Supabase URL and publishable key to exercise account features.
Keep the server database connection private. Guest browser practice is available
without account configuration, but account synchronization is not.

```bash
pnpm db:status
pnpm db:logs
pnpm db:down
```

Stopping Compose preserves its named database volume. Removing that volume
deletes local data. The bootstrap command applies pending migrations and the
existing development seed; repeated runs do not reset the database.

If pnpm tries to download its own pinned version unexpectedly, check the
repository's manage-package-manager-versions=false setting in .npmrc.

## Learner workflows

- Use /practice for structured-English or block-style reasoning, feedback, and
  optional Python 3, C++20, or TypeScript verification.
- Use /roadmap for the algorithm and system-design analysis catalog. Only entries
  connected to a coding activity offer verified code practice.
- Use /onboarding and /settings for preferences, /dashboard for recommendations
  and due reviews, and /history for prior practice.
- Use /library for study resources, notes, and bookmarks.
- Use /auth for account signup, confirmation, sign-in, and sign-out.
- Use /classes to join with a class code and open assigned work. Published grades
  and feedback appear at /classes/[classId]/grades.

Practice retains a device-local copy. Guest learning estimates use this device;
signed-in dashboard estimates use account evidence across devices. A local save
message does not establish account synchronization. Check the workspace's save status
before changing devices; if persistence fails, retain the draft and retry.

The signed-in dashboard uses released, eligible quiz results and newly recorded
practice verification to suggest activities and explain **Why this question?**
Concept estimates show evidence coverage and a model range; unknown concepts
have no inferred weakness. Repeating the same question or activity updates its
evidence without adding independent coverage. Older practice history remains
available but may not contribute to estimates until a new verification.

Due concept reviews follow account evidence. **Tomorrow** moves a review without
changing an estimate or class grade; an interrupted request can safely be retried.
Use /settings to disable personalization and follow the standard curriculum.
An unavailable account plan offers retry and curriculum access.

Workspace caches are separate for each verified account or guest identity.
When local and server drafts diverge, saving pauses until you choose which to
continue; the other copy remains available under **Saved recovery copy**, including
after reload. **Retry saving** reuses an unacknowledged save safely. If the account
connection is unavailable, new work stays in a separate device draft; reconnect
and explicitly import it to continue in an account. Older unscoped browser drafts
also require explicit import and are never automatically attached to an account.

After evaluating pseudocode, meeting every reasoning check or at least 80% with
no conflicting algorithm instruction unlocks continuation. Choose **Continue to
coding** or **Next practice question**. **Continue anyway** offers manual control
even before the checks pass; it preserves the feedback and never awards a grade
or verified completion. That choice is local to the current account, activity,
and exact draft. Moving to another question first preserves the current work.

Assigned learners can open and submit coding work without passing the optional
reasoning gate. Workspace saves accept coding-only work with an empty reasoning
draft, including received test feedback. Submission, verification, instructor
grading, and publication are separate states. Private rubric drafts and instructor
notes are not learner grades.
Completed verification reports, including partial-test results, are saved on the
server before the response is returned. Reload can restore the latest saved
report even if the browser did not finish autosaving it. A report applies only
to its submitted code and language; later edits remain unverified.
Learners can request review of their own published grades and inspect the public
request status and instructor response.

## Teaching and administration

Instructors create and manage their own classes at /teach. A class can
assign an existing practice activity with a title, instructions, and optional
due date. The submission inbox supports manual rubric drafts and explicit
publication; the gradebook shows published totals, coverage, and comparable
ranks. Instructors can excuse/restore recipients with a reason and resolve grade
review requests within their own classes.

Save changed scores or feedback before publishing. The editor shows unsaved
changes and confirms publication of the saved revision. A failed save or
publication response can be retried without reentering feedback; a published
grade can be corrected by saving and publishing a new revision.

Class workspaces also provide **Quiz drafts** for instructors and administrators
with class-management permission. Choose **Create a quiz draft** to search the
20-question starter bank, preview questions, set their order and points, and save
instructions and optional opening/due/closing times. Drafts resume from the class
workspace and stay private to authorized authors; saving does not assign them to
learners or publish grades. Conflicts retain entered work for comparison, and
retries can recover an unconfirmed save. Starter questions have independent
automated content review; teacher validation remains outstanding.

On a saved quiz, choose **Load class audience**, select all current learners or
a subset, review the saved revision and dates, and confirm **Assign quiz**.
Publication freezes the questions, points, and recipients. Later draft edits and
class joins do not change that assignment; a later cohort needs a new draft.
Administrative class-management permission does not grant private-grade access.

Learners open quizzes from /classes, choose answers, and use **Save answers** to
resume across devices. **Review and submit** shows unanswered questions before
one final submission. Closing time blocks new saves/submissions; accepted retries
can still recover their receipts. The owning instructor opens the quiz from the
class gradebook and explicitly releases its saved score. Learners then see the
same published score in the quiz receipt and class grades. Answer keys and
explanations remain private.

Platform administration is separately authorized at /admin. Administration
roles are stored on the server; instructor signup does not grant them. Authorized
administrators manage classes at /admin/classes and roles at /admin/users.
The initial administrator bootstrap requires an existing confirmed account and
refuses to run after an administrator already exists:

```bash
pnpm admin:bootstrap -- owner@example.com "Initial project administrator"
```

Use an address you control. Later grants belong in the audited role editor.
The /admin-preview route is a development-only sample and is not real class data.

## Runtime configuration

Use apps/web/.env.example as the configuration reference. Store actual secrets
in ignored local files or the deployment's managed environment settings.

| Setting | Behavior |
|---|---|
| DATABASE_URL or POSTGRES_* | Server-only database connection; local Compose is the development default |
| NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public Auth client configuration |
| NEXT_PUBLIC_APP_URL | Application origin used by authentication flows |
| EVALUATION_JOB_STORE | PostgreSQL mode persists evaluation jobs; memory mode is instance-local |
| RATE_LIMIT_STORE | PostgreSQL mode shares submission counters across instances after migration; memory mode is a local fallback |
| CODE_EXECUTION_ENABLED and CODE_EXECUTION_PROVIDER | Enable only with a configured isolated provider and verified resource limits |
| Worker token settings | Server secrets for protected worker triggers; never client configuration |
| OTEL_EXPORTER_OTLP_ENDPOINT | Optional trace/metric export; structured server error records remain available without it |

Durable evaluation and exploratory-execution queues require their protected
worker triggers. Assignment verification uses a separate leased queue and
protected trigger. Configure scheduling in the hosting environment; the presence
of a route alone does not prove that processing is operational.

## Validation and troubleshooting

```bash
pnpm docs:check
pnpm preflight
```

GET /api/health checks liveness. GET /api/health/ready checks database readiness;
evaluation, execution, and verification health routes expose aggregate queue
status. Use safe request IDs from the x-request-id header in reports, excluding
learner text, code, tokens, cookies, and database connection strings.

If a grade or draft appears stale, confirm the account, save/publication state,
database readiness, and relevant worker status. Preserve the original response
before retrying. Report reproducible loss through a sanitized bug report rather
than editing stored grade history directly.

Build the existing production container from apps/web with Docker when needed.
Apply required migrations before deploying queries that depend on them. Confirm
readiness and the changed workflow after deployment; keep restore and provider
rollback procedures with the deployment owner.

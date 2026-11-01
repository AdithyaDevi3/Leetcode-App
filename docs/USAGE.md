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
pnpm --filter @leetcode-app/domain build
pnpm --filter @leetcode-app/database build
pnpm --filter @leetcode-app/observability build
pnpm db:up
pnpm db:bootstrap
pnpm dev
```

Open <http://localhost:3000>. On a fresh clone, build the three shared packages
first: their exports reference generated files and `pnpm dev` starts only Next.js.
Rebuild a shared package after editing it, or run its development watcher in a
separate terminal.

The example defaults to local PostgreSQL and guest development. Leave
`DATABASE_URL` commented and the two Supabase public Auth values empty for this
path. A populated `DATABASE_URL` overrides `POSTGRES_*`; placeholder URLs are not
valid local configuration. Existing checkouts should preserve their environment
file and review these settings rather than overwriting it.

The local bootstrap creates missing compatibility roles and auth primitives
inside the Compose PostgreSQL service before applying migrations. It preserves
existing auth definitions and does not run a Supabase sign-in service. Account
flows require approved development Supabase Auth and database configuration from
the maintainer. Guest device practice works without Auth; durable guest sessions
need PostgreSQL. Keep server credentials private and use synthetic development
accounts rather than production learner data.

Bootstrap requires a local Docker socket or local named-pipe context and rejects
network Docker endpoints. It pins the verified endpoint for its Compose commands.
For custom local `POSTGRES_*` values, export the same settings in the terminal
running Compose/bootstrap and configure the web environment consistently. Compose
and bootstrap do not load `apps/web/.env.local` automatically.

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

For a first setup check, open /api/health, confirm `pnpm db:status`, then save a
guest practice draft and reload. Inspect its save status to distinguish a device
save from a database save. The hosted /api/health/ready probe also requires Auth
configuration: HTTP 503 with `supabase: missing_configuration` is expected in the
guest-only setup and does not test database reachability. A disabled code runner
is also expected in the default setup.

## Learner workflows

- Use /practice for structured-English or block-style reasoning, feedback, and
  optional Python 3, C++20, or TypeScript verification.
- Use /roadmap for the algorithm and system-design analysis catalog. Only entries
  connected to a coding activity offer verified code practice.
- Use /onboarding and /settings for preferences, /dashboard for recommendations
  and due reviews, and /history for prior practice.
- Use /diagnostic for an optional signed-in, ten-question skills check.
- Use /library for study resources, notes, and bookmarks.
- Use /auth for account signup, confirmation, sign-in, and sign-out.
- Use /classes to join with a class code and open assigned work. Published grades
  and feedback appear at /classes/[classId]/grades.

Practice retains a device-local copy. Guest learning estimates use this device;
signed-in dashboard estimates use account evidence across devices. A local save
message does not establish account synchronization. Check the workspace's save status
before changing devices; if persistence fails, retain the draft and retry.

The practice workspace has separate **Approach**, **Feedback**, and **Code & test**
stages. Stage navigation and browser Back/Forward retain the current draft.
On desktop, drag the dividers or focus them and use arrow keys to resize the
problem, editor and results panels. **Reset layout** restores their sizes.
On phones, use **Problem**, **Workspace** and **Results** to switch panels.
The context tabs keep the problem, current approach, feedback and notes available.
Other pages remain reachable through the workspace's **More** menu.

The editor supports Tab to indent, Shift+Tab to outdent, language-aware Enter,
undo/redo, search, wrapping, font size and two/four-space indentation. Press
Escape, then Tab or Shift+Tab to move keyboard focus out of the editor.
**Reindent selection** adjusts whitespace; it does not repair program logic.
Python, C++ and TypeScript keep separate saved source drafts. Resetting a session
or replacing edited code with a plan asks for confirmation and retains a recovery
copy. A language change clears the active verification display; run verification
for the selected source. These editor features require no additional paid service.

The signed-in dashboard uses released, eligible quiz results, answered skills-check
items, and newly recorded practice verification to suggest activities and explain
**Why this question?**
Concept estimates show evidence coverage and a model range; unknown concepts
have no inferred weakness. Repeating the same question or activity updates its
evidence without adding independent coverage. Older practice history remains
available but may not contribute to estimates until a new verification.

Open **Optional skills check** on the dashboard or visit /diagnostic. Each account
has one saved ten-question check per question-set version, covering one idea from
each coding activity. Navigate one question at a time, choose **Save answers** to
resume across devices, then **Review and submit** and confirm the final submission.
Submission freezes your choices and reveals explanations from a separate practice
pool; class-quiz answers stay private. Results show correct answers out of answered
items, with skipped items listed separately. Skips add no learning evidence and
do not imply a weakness. The check creates no class grade. Personalization opt-out
still allows saving and reviewing the check while excluding its results from your
learning plan.

Starting a recommended activity records that explicit choice and its current plan
when personalization is enabled. Viewing or refreshing a plan records no choice.
An uncertain reply offers **Retry practice selection**, preserving the original
request across reloads; **Open practice without confirming selection** keeps
practice accessible. A changed recommendation requires loading the latest plan.
A later trusted verification for the same activity within fourteen days may be
associated with the latest matching choice. This is an observed result, not proof
that the recommendation caused improvement.

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
60-question bank, preview questions, set their order and points, and save
instructions and optional opening/due/closing times. Drafts resume from the class
workspace and stay private to authorized authors; saving does not assign them to
learners or publish grades. Conflicts retain entered work for comparison, and
retries can recover an unconfirmed save. Catalog questions have independent
automated content review; teacher validation remains outstanding.

On a saved quiz, choose **Load class audience**, select all current learners or
a subset, review the saved revision and dates, and confirm **Assign quiz**.
Publication freezes the questions, points, and recipients. Later draft edits and
class joins do not change that assignment; a later cohort needs a new draft.
Administrative class-management permission does not grant private-grade access.

Choose **Copy draft** beside a saved quiz or in its editor. Review the saved
revision, ordered questions and points, choose the destination class, then select
**Create private copy**. Both source and destination require current authoring
permission. The copy preserves instructions, order and exact points, starts with
“Copy of” in its title, and clears dates. It copies the saved draft version;
unsaved edits and an assigned quiz's frozen publication may differ. The original
quiz, audience, submissions and grade history stay unchanged.

Open the copied draft to edit it, set new dates and use the ordinary audience
preview and assignment flow. Creating a copy assigns nothing. Unavailable question
versions block a new copy and link to the source editor for repair. If the reply
is uncertain, **Retry earlier copy** recovers the same request and saved draft,
including after a reload or later source edits. Refresh and review a changed
source before starting a new request. Browser recovery belongs to the original
account, workspace and source; account changes pause the preview and copy actions.

Open **Class insights** from a class workspace to review concept coverage from
released quiz answers by currently enrolled learners. Counts distinguish answered
items, different logical questions, and learner coverage. Skips do not indicate
weakness, and repeated questions count once per learner. Corrections, excusals,
grade disputes and enrollment changes affect the next refreshed report. Personal
practice and skills-check results are excluded. Observed correctness is not a
mastery score or a learner ranking; limited coverage calls for more evidence.

The administrator view requires class-insight permission and hides all concept
statistics when fewer than five learners have answered evidence for that concept.
Hidden statistics do not determine the suggested focus. This aggregate view
grants no access to individual grades or responses.

Choose up to three concepts and **Preview selected concepts**, then **Open editable
quiz draft**. Suggestions favor unused, reviewed foundation/intermediate questions
from the class bank. The editor checks the current class context again; edit the
questions, points, instructions and dates before saving. Suggestions do not create
assignments automatically. Use the saved draft's existing audience preview to
assign the whole class or selected enrolled learners. If unused questions are
exhausted, choose other concepts or create a quiz from the full bank. Focused
browser drafts use separate recovery buffers, preserving other unfinished quizzes.

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

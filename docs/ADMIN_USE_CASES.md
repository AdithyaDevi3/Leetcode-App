# Administration and Learner Use Cases

These use cases describe behavior implemented on this branch as of 2026-09-20.
“Planned” entries are the next workflow boundaries, not available controls.
Read [Administration and Learner Architecture](ADMIN_ARCHITECTURE.md) for the
components, role matrix, data model, and authorization sequence.

## Actors

| Actor | Identity | Scope |
|---|---|---|
| Guest learner | Validated guest session cookie | Practice and own feedback requests; no admin or class enrollment. |
| Signed-in learner | Supabase Auth account and application user row | Own practice, feedback, appeals, and account lifecycle requests. |
| Operator | Signed-in learner with one or more active database administration roles | Role-scoped admin views; still uses the learner app. |
| Administrator | Operator with `administrator` role | All admin views and audited role changes. |
| Legacy appeal reviewer caller | Shared bearer token for the internal appeal route | Can resolve an appeal outside the portal; scheduled for replacement. |

## Implemented learner-to-operator journeys

### UC-01: Sign in and discover administration

**Actor:** Operator. **Precondition:** Confirmed Supabase account with an active
administration role assignment.

1. The person signs in through the ordinary learner authentication flow.
2. The learner navigation calls `GET /api/viewer`. The server verifies the
   session and checks for any active administration role.
3. The navigation shows **Admin** when `canAccessAdministration` is true.
4. Opening `/admin` rechecks the session and role on the server. The shell
   displays only pages granted by the current role set.

**Outcome:** The operator can move between the learner app and the permitted
admin pages. A missing navigation link never serves as access control.
Signed-out visitors are redirected to sign-in. Signed-in users with no admin
role see an access-denied page. If the viewer check fails, learner navigation
can remain available while the Admin link is absent.

### UC-02: Submit and inspect feedback

**Actor:** Guest or signed-in learner. **Operator:** `support` or
`administrator`.

1. The learner uses the Feedback page to submit a question or feature request.
   `POST /api/learner/requests` validates its type, title, description, and
   optional source URL, then saves it for the verified user or guest owner.
2. `GET /api/learner/requests` returns only that owner's requests, including
   their statuses and descriptions.
3. A permitted operator opens `/admin/feedback`. The server loads the latest
   50 request metadata rows and shows title, type, submitter label, status,
   and date. It does not display the full description.

**Outcome:** A learner can see their own submission; an operator can see a
cross-user queue summary. The portal currently has no reply, triage, or status
change action. Invalid submissions return `400`; data failures return `500`.

### UC-03: Submit and inspect an evaluation appeal

**Actor:** Signed-in learner. **Operator:** `evaluator_reviewer` or
`administrator`.

1. The learner submits an appeal through the job-specific appeal API. The
   server first verifies that the evaluation job belongs to that learner and
   practice session, then requires a finding ID and nonblank context.
2. The learner can list appeals for that owned job through the same route.
3. A permitted operator opens `/admin/operations`, which shows the latest 50
   appeal metadata rows alongside evaluation and execution queue counts.

**Outcome:** The operator can identify pending or reviewed appeals without
seeing the learner's full context in the portal. The admin portal cannot approve
or reject appeals. The existing internal token route can resolve them outside
this flow; see UC-15. Unauthenticated requests return `401`; an unowned job
returns `404`.

### UC-04: Request account export or deletion

**Actor:** Signed-in learner. **Operator:** `privacy_operator` or
`administrator`.

1. The learner submits `export` or `deletion` to
   `POST /api/account/lifecycle`, with an optional reason, and can list their
   own requests through `GET /api/account/lifecycle`.
2. A second active request of the same type for the same user returns the
   existing active record through the database's conflict rule.
3. A permitted operator opens `/admin/privacy` to see the latest 50 request
   types, statuses, submitter labels, and dates.

**Outcome:** The request is tracked. This is an API capability; there is no
learner-facing account-lifecycle form in the current app. The portal cannot
generate an export, delete an account, or change request status. Anonymous
requests return `401`; invalid types return `400`.

### UC-05: Inspect practice and system queues

**Actor:** Any operator for the overview; `evaluator_reviewer` or
`administrator` for Operations.

1. `/admin` reads current account, practice, feedback, appeal, evaluation,
   execution, and privacy counts. It renders only metrics permitted by the
   operator's roles.
2. `/admin/operations` shows queued/running/failed job counts, oldest queued
   times, and appeal metadata to an operator with `operations.read`.

**Outcome:** Operators can see operational load without submitted source code
or worker credentials. There are no queue retry, cancel, or kill-switch actions.

### UC-06: Review people, content, and audit history

**Actor:** Roles with the respective `users.read`, `content.read`, or
`audit.read` action.

- `/admin/users` lists the latest 50 accounts, emails, join dates, and active
  operator roles. `support` and `privacy_operator` may read this page but cannot
  edit assignments.
- `/admin/content` lists the latest 50 content items and latest version
  metadata. Authors and reviewers can inspect it but cannot edit or publish
  through the portal.
- `/admin/audit` lists the latest 100 privileged events. Only administrators
  can access it. The current events include first-admin bootstrap and portal
  role changes; the legacy appeal audit is stored separately.

**Outcome:** Authorized users receive bounded metadata lists. Direct requests
to a page without its action permission show the area-denied view.

## Implemented classroom journeys

### UC-07: Create a class and share its code

**Actor:** Administrator.

1. Open `/admin/classes`, give the class a name and optional description, and
   provide an audit reason.
2. The server checks `classes.manage`, generates a unique 12-character code,
   creates the class, and records the audit event in one transaction.
3. Open the class page and share the displayed code with intended learners.

**Outcome:** The class appears in the admin list. The code is not exposed by a
public class directory. An invalid form or unauthorized account cannot create
a class. A signed-in learner can still use regular practice without a code.

### UC-08: Join a class

**Actor:** Signed-in learner.

1. Open `/classes` and enter the code, with or without its displayed hyphen.
2. The server verifies the learner's session, finds the active class, and adds
   an enrollment. Entering the same code again leaves one enrollment.
3. The learner sees the class and its tasks. The administrator sees the learner
   in the class roster.

**Outcome:** Class membership links the learner and administrator views without
granting any administration role. Guests must sign in. An invalid code returns
a generic error without revealing other classes.

### UC-09: Assign practice to a class

**Actor:** Administrator.

1. Open a class, enter a task title, select one existing published practice
   activity, optionally add instructions and a due date, and give an audit
   reason.
2. The server checks `classes.manage`, validates the activity, and creates the
   assignment and audit event together.
3. Every enrolled learner sees the task at `/classes` and can open its activity
   in the existing practice workspace.

**Outcome:** One class can have multiple tasks, but the same activity can be
assigned only once to that class. A duplicate assignment is rejected without a
second audit event. Individual learner assignments and custom written tasks are
not part of this slice.

### UC-10: Track task completion

**Actors:** Signed-in learner and administrator.

1. The learner completes the assigned activity through the existing verified
   code test flow.
2. `/classes` reads the learner's owned practice session status and shows the
   task as complete. The admin class page shows completion counts per task and
   learner.

**Outcome:** Passing verification marks the practice session complete; no
manual class submission or grading step is required. Prior verified completion
of the same activity also counts. Drafts and unverified pseudocode do not count.

## Implemented access-management journeys

### UC-11: Provision the first administrator

**Actor:** Authorized maintainer using the operational command.
**Preconditions:** The target email belongs to a confirmed Supabase Auth user;
the target environment has the administration migration; no active
administrator exists.

1. Run `pnpm admin:bootstrap -- <confirmed-email> <reason>` with a reason of
   8–500 characters in the target environment.
2. The repository takes a transaction lock, checks that no administrator is
   active, finds the confirmed Auth user, ensures the application user row,
   inserts the administrator assignment, and appends a bootstrap audit event.

**Outcome:** The target can open `/admin` on their next signed-in request. The
command refuses a second bootstrap and refuses an unknown or unconfirmed
account. Migration backfill of legacy `users.role = 'admin'` accounts can mean an
administrator already exists before this command runs.

### UC-12: Change operator roles

**Actor:** Administrator. **Precondition:** An active `administrator` assignment
and an account in the People list.

1. Open `/admin/users`, expand **Edit roles**, and select the complete desired
   role set for the target.
2. Enter a reason of 8–500 characters and submit.
3. The server validates the target UUID and role values, rechecks
   `administration.manage`, and calls the repository.
4. In one transaction, the repository revokes omitted roles, inserts new
   roles, and records actor, target, reason, request ID, and before/after role
   sets. The page then revalidates and displays a success message.

**Outcome:** The target's next admin request uses the new role set. The form
replaces the entire set, so unchecked roles are removed. A malformed request or
insufficient permission fails without applying a change. Database failure
rolls back role and audit writes together. The page has no account search, so
the editor currently covers only the latest 50 accounts.

### UC-13: Prevent removal of the final administrator

**Actor:** Administrator attempting to remove an administrator role.

1. Submit a role set that omits `administrator` for a target who currently has
   it.
2. The transaction checks whether another active administrator remains.

**Outcome:** If none remains, the change is rejected and the page displays the
error. Other roles and audit data are not partially written.

### UC-14: Handle signed-out, unauthorized, and unavailable states

**Actors:** Visitor, learner, operator.

- A signed-out visitor opening `/admin` or a child page is redirected to
  `/auth` with a return destination.
- A signed-in learner with no operator role sees the restricted-workspace
  message. An operator opening a page outside their role sees an area-denied
  message.
- The admin pages provide a loading state and a retryable error view for page
  failures. An unavailable database does not grant access.

## Existing workflow outside the portal

### UC-15: Resolve an appeal through the legacy internal endpoint

**Actor:** Caller holding `EVALUATION_REVIEWER_TOKEN`.

1. The caller sends the token and supplies a reviewer ID, approval Boolean,
   and reason to the internal appeal-resolution endpoint.
2. The appeal store changes an unresolved appeal to resolved and inserts an
   `evaluation_appeal_audit` row in one transaction. A resolved or missing
   appeal returns `404`.

**Outcome:** This is the current resolution path, but the supplied reviewer ID
is not tied to a signed-in operator session by that route. It is not reachable
from `/admin/operations`, and it does not create an
`administration_audit_events` entry. Replacing it is the next administration
milestone in ADR-011.

## Planned use cases

| Use case | Intended operator interaction | Current gap |
|---|---|---|
| Review an appeal | A signed-in evaluator reviewer gives a reason and approves or rejects an owned appeal; the decision is attributable and replay-safe. | Portal is read-only; legacy token route remains. |
| Triage learner feedback | Support reviews a request and records a response or state transition with an audit trail. | Portal lists metadata only. |
| Publish content | Author drafts, distinct reviewers approve rights and content, then a version is published or rolled back. | Portal lists version metadata only. |
| Fulfill privacy request | Privacy operator tracks an export or deletion through completion. | Request API and metadata view exist; no execution workflow. |
| Control platform incidents | Authorized operator changes flags or disables evaluation/execution with audit evidence. | No portal control is implemented. |

Each planned mutation needs fresh server authorization, target-object checks,
reason validation, transactional audit, and a clear failure or retry outcome
before it is described as available.

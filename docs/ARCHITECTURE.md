# Architecture

Method is a modular monolith: a Next.js web/API application, shared TypeScript
domain code, and PostgreSQL repositories. This document describes implemented
boundaries. Deployment settings and verification determine which integrations
are operational in a given environment.

```mermaid
flowchart LR
    Browser[Browser / PWA] --> Web[Next.js application]
    Web --> Auth[Supabase Auth]
    Web --> DB[(PostgreSQL)]
    Worker[Protected workers] --> DB
    Web --> Sandbox[Isolated code execution]
    Worker --> Sandbox
```

## Components and responsibilities

| Component | Responsibility |
|---|---|
| apps/web/src/app | Learner, instructor, and administration routes; authenticated APIs and actions |
| apps/web/src/components | UI state, accessible controls, navigation, and learner workflows |
| apps/web/src/lib | Application services, evaluation, continuity, provider adapters, and server authorization |
| packages/domain | Framework-independent policies and contracts, including grade calculations and recommendation foundations |
| packages/database | Database client, repositories, append-only records, and node-pg-migrate migrations |
| packages/feature-flags | Feature-control foundations |
| packages/observability | Structured telemetry and correlation foundations |
| infra | Infrastructure definitions and modules; committed definitions do not prove a deployed environment |
| .github/workflows | Build, security, browser, worker, and health automation |

The managed runtime uses Vercel, Supabase Auth/Postgres, and Vercel Sandbox.
Local development uses the checked-in PostgreSQL Compose service. Judge0 remains
an optional execution adapter. The optional AI path is disabled by default;
deterministic evaluation remains the baseline.

## Identity and authorization

Supabase verifies signed-in identities and refreshes server cookies. Guests
have a separate HTTP-only guest identity. Guest-to-account merge is explicit.
Browser preferences and editable identity metadata cannot grant privileges.

Learner repositories enforce user/guest ownership for the concrete object.
Instructor classroom repositories enforce the authenticated class owner's ID.
Administration uses server-controlled role assignments and per-action permission
checks; instructor opt-in does not create an administration assignment. Every
protected page or mutation rechecks authorization regardless of visible links.

Browser database roles do not receive unrestricted repository access. Sensitive
tables use RLS and restricted grants, while privileged server connections still
enforce ownership in SQL. Audit events accompany role and class mutations.
Database failure never grants access.

## Practice and learning state

Versioned sessions and revisions preserve drafts, evaluation history, and
completion. Guarded browser storage buffers local work and supports guest use;
an offline cache is not proof of a server save. Account resume and merge code
must resolve ownership and revision conflicts without silently replacing work.

The deterministic evaluator uses activity-specific rubrics. Evaluation jobs
support polling, cancellation, retry accounting, and lease recovery. Runtime
selection can use PostgreSQL or instance-local memory; durable operation needs
the database mode and a configured protected worker trigger.

Profiles and scheduled concept reviews are persisted. The active dashboard also
uses device-local history/mastery calculations and interpretable recommendation
rules. Domain mastery/recommendation foundations and a concept-mastery table
exist; a fully connected cross-device evidence pipeline is not established by
those foundations alone.

## Classes and gradebook

Classes have server-generated enrollment codes, explicit ownership, assignments,
and enrolled learners. Current assignment authoring selects an existing practice
activity. Content-level practice completion and assignment grades are distinct.

The gradebook repository stores immutable published policy/content snapshots,
explicit recipients, assignment response revisions, grade revisions, publication
history, applicability changes, and grade-review events. It does not infer grades
from a learner's private practice. Published policies pin content, rubric or
verifier versions, maximum points, and attempt rules.

Points use integer hundredths. Totals use published numeric outcomes and expose
coverage; ranking requires a comparable finalized assignment set. Excused work
changes a learner's denominator. An active dispute keeps the published score
visible while excluding the learner from comparable ranking.

Learners see their own published results, public feedback, and review history.
Draft scores and private instructor notes remain private. Instructor queries
enforce class ownership; the gradebook has no implicit global-administrator
scope. Publication and correction use expected revisions, recipient locks, and
idempotency keys. A newer submission remains pending even when an older published
grade is available in history.

Manual rubric grades require every published criterion. Missing-work zeros
require an explicit elapsed closing time and attributable instructor action.
Verified-completion results come from the trusted worker and pinned test suite;
the learner cannot submit a pass flag, hidden tests, or grade identifiers.

The latest completed practice verification is stored separately from editable
workspace state in the account/guest-owned session metadata. A server-generated
request marker orders runs; stale completions cannot replace a newer request.
The report, submitted source/language, completion state, and initial review
schedule commit transactionally before a successful response. Autosave cannot
overwrite the protected report. Read projections restore matching results and
keep later code edits unverified. This latest-report snapshot is separate from
the immutable assignment gradebook history.

## Code execution and queues

Python 3, C++20, and TypeScript verification use server-owned activity tests.
Vercel Sandbox executes code in ephemeral microVMs with network access denied
and bounded process time/output. Learner code never executes directly in the
ordinary application process. Provider credentials remain server-only.

Assignment verification has its own durable leased queue. Creating an attempt
and its job is transactional. Lease tokens protect completion and retries from
stale workers; only the current eligible attempt can produce the current result.
Practice execution and reasoning evaluation have separate queue boundaries.
Expensive routes support quotas, backpressure, and failure states rather than
silently treating provider unavailability as a learner failure.

## Data and API conventions

Repositories own transactions and object-level authorization. Validate external
inputs, make retried mutations idempotent, and return optimistic conflicts for
stale writes. Published content and grading evidence retain exact versions.
Use additive migrations and separately reviewed destructive changes.

Server errors and queue health expose privacy-bounded context and correlation
IDs. Exclude raw submissions, personal notes, emails, tokens, and cookies from
logs. Auth secrets, database connections, and worker credentials are never public
client configuration. Production data does not belong in preview/local fixtures.

## Decisions and tradeoffs

- A modular monolith keeps deployment and transactions manageable while shared
  domain modules preserve boundaries for later changes.
- PostgreSQL stores application state and durable jobs, avoiding a required
  additional queue service; workers and scheduling still need operating evidence.
- Deterministic rubrics and trusted tests make results reproducible. They cover
  authored activities and do not establish general semantic grading.
- Append-only grading records cost more storage and require explicit projections,
  but preserve corrections, disputes, and exact published evidence.
- Local buffers keep guest/offline work usable while requiring explicit sync,
  ownership, and conflict handling for account continuity.

See [usage](USAGE.md) for setup and supported workflows and
[conventions](CONVENTIONS.md) for implementation, validation, and release rules.

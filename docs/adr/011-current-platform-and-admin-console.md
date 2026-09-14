# ADR-011: Current Platform and Administration Console Boundary

## Status

Accepted for the current platform; administration delivery is incremental.

This ADR supersedes ADR-002, ADR-003, and ADR-007 wherever their earlier
Auth0/Firebase, generic managed PostgreSQL, or AWS-first choices conflict with
the deployed Supabase and Vercel implementation.

## Context

The product now has a working learner application, Supabase-backed identity and
persistence, and Vercel-hosted code execution. The original ADRs predate those
choices. A new maintainer also needs to build administration without exposing
privileged credentials or treating a hidden URL as authorization.

The domain package already defines granular administration roles and actions,
and an internal appeal-resolution endpoint exists behind a shared reviewer
token. There is no admin UI, no production admin-session authorization gate,
and no complete privileged audit log.

## Decision

### Current platform

- Next.js in `apps/web` is the deployed modular monolith on Vercel.
- Supabase Auth provides active email/password identity and session refresh.
- Supabase Postgres is the production system of record; repository migrations
  use `node-pg-migrate`.
- Vercel Sandbox executes untrusted TypeScript and Python with outbound network
  access denied.
- Administration starts inside `apps/web`; create a separate `apps/admin` only
  after deployment ownership or scaling creates a demonstrated need.

### Authorization boundary

Administration is deny-by-default and enforced on the server for every page,
loader, route, and mutation.

1. Store granular assignments in a dedicated database table keyed by the
   Supabase user ID. Keep the existing coarse `users.role` only for compatibility
   while migrating.
2. Reuse `AdministrationRole`, `AdministrationAction`, and
   `canPerformAdministrationAction` from
   `packages/domain/src/administration.ts` as the application policy vocabulary.
3. Read assignments from server-controlled database rows. Never authorize from
   `user_metadata`, query parameters, client storage, or UI visibility.
4. A server-side permission helper must guard each action and return 404 or 403
   without leaking protected object details.
5. Browser code receives only the minimum data needed for the current view.
   Supabase admin APIs and secret/service-role credentials remain server-only.
6. Every privileged mutation appends an audit event containing actor, action,
   target type and ID, reason, request ID, and timestamp. Do not store learner
   submissions, emails, tokens, or secrets in the audit payload.
7. Keep RLS enabled for Data API access. Policies must combine authenticated
   role selection with ownership or explicit administration permission.

Supabase custom access-token claims may later reduce repeated role lookups, but
database authorization remains authoritative for sensitive mutations because
JWT claims are not immediately refreshed after role changes.

### First delivery sequence

#### 1. Authorization foundation

- Add role-assignment and audit-event migrations with RLS and repository tests.
- Add `requireAdministrationAction(action)` as a server-only helper.
- Seed the first administrator through a reviewed one-time operational process,
  never through public signup or editable metadata.
- Add allow/deny tests for every administration role and action.

Exit condition: an ordinary learner cannot load admin data or perform an admin
mutation by calling the API directly.

#### 2. Read-only shell

- Add `/admin` with accessible navigation and explicit empty/error/loading
  states.
- Show safe queue counts and health summaries only; do not expose raw learner
  submissions or credentials.
- Link to requests and evaluation appeals through paginated server endpoints.

Exit condition: authorized operators can inspect operational queues without
mutation capability, and every access is correlated in logs.

#### 3. Reviewed queue actions

- Replace shared `EVALUATION_REVIEWER_TOKEN` bearer authorization with
  authenticated, session-based permission checks.
- Add reason-required approve/reject actions for appeals and learner requests.
- Make mutations idempotent and append audit events transactionally.

Exit condition: actions are attributable, replay-safe, least-privilege, and
covered by authorization tests.

#### 4. Content operations

- Add draft, review, rights approval, publish, deprecate, and rollback views for
  immutable content and rubric versions.
- Preview unpublished content through a server-authorized path.
- Require distinct approval permissions before publication.

Exit condition: no single accidental UI action can overwrite published content
or bypass required review.

#### 5. Support and platform controls

- Add redacted learner/account diagnostics, privacy request tracking, feature
  flags, and execution/evaluation kill switches.
- Do not add unrestricted impersonation. Any future impersonation requires a
  separate security decision, explicit reason, short expiry, and audit trail.

Exit condition: operators can diagnose and contain incidents without direct
database editing or unrestricted access to learner data.

## Non-goals for the first admin release

- Billing, organization tenancy, and custom analytics dashboards.
- Editing production rows through a generic table editor.
- A separate admin deployment.
- Client-side service-role access.
- Automatic role assignment based on email domain.

## Consequences

The first useful admin surface is intentionally read-only and small. Delivery
is slower than adding an unprotected dashboard, but authorization, auditability,
and data minimization become reusable foundations for every later operator
feature. Starting in the existing web app avoids premature deployment and UI
package duplication.

## References

- [Supabase custom claims and RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase JavaScript auth admin APIs](https://supabase.com/docs/reference/javascript/admin-api)

## Review Date

2026-12-14, or before adding the first privileged production mutation.

## Owners

- Product owner: defines operator workflows and data-minimization needs.
- Engineering owner: implements authorization, audit, and UI boundaries.
- Security owner: reviews role provisioning, RLS, privileged APIs, and release
  evidence.

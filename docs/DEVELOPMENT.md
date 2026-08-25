# Development Guide

This guide covers the current repository and the conventions to preserve as the full platform is built. Product scope lives in [PRODUCT_PLAN.md](PRODUCT_PLAN.md), target boundaries in [ARCHITECTURE.md](ARCHITECTURE.md), and implementation order in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Prerequisites

Current web app:

- Node.js 24 LTS.
- pnpm 9.x (the workspace `packageManager` field pins this; see the pnpm note below).
- Git.
- Docker Desktop for production-image checks.

Later persistent phases also require PostgreSQL and the selected queue/cache emulators. Add those through a checked-in container composition file when their first feature lands; do not require developers to install databases globally.

### pnpm self-managed version note

The root `package.json` pins `packageManager: pnpm@9.0.0`. Recent pnpm releases try to
self-switch to that exact pinned version on every invocation, which can fail if the
switch cannot reach the registry or resolve a cached copy (`ENOENT` on a
`.pnpm-store/.../bin/pnpm` path, or a `fetch failed` error). The repository's
`.npmrc` disables this self-management (`manage-package-manager-versions=false`) so
`pnpm` always uses whatever version is already on your `PATH` instead of trying to
download a pinned one. If you still hit a pnpm version error locally, confirm your
`.npmrc` includes that setting.

## Clone and run

```bash
git clone https://github.com/AdithyaDevi3/Leetcode-App.git
cd Leetcode-App
pnpm install
cd apps/web
pnpm dev
```

Open `http://localhost:3000`. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in
Postgres, `AUTH_SECRET`, and OAuth provider credentials before signing in; the practice workspace
itself still falls back to local storage when signed out.

## Current validation

Run before every pull request:

```bash
pnpm preflight
```

This runs the same checks CI runs for the web workspace — install, lint, type
check, tests, and build — auto-fixing lint issues where possible and printing a
pass/fail summary. Fix anything it reports as failing, then re-run it until it
passes before opening the PR. See [PREFLIGHT.md](PREFLIGHT.md) for details.

Equivalent manual commands, if you want to run a single step:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm -r test
pnpm --filter web build
```

Build and smoke-test the production container:

```bash
cd apps/web
docker build --pull -t method-web:local .
docker run --rm -p 3001:3000 method-web:local
curl --fail http://localhost:3001/api/health
```

Expected health payload:

```json
{"status":"ok","service":"method-web"}
```

## Environment configuration

When server integrations are added:

1. Commit `.env.example` with names and safe placeholders only.
2. Keep `.env`, `.env.local`, provider files, keys, and certificates ignored.
3. Validate required server variables at startup with a schema.
4. Treat every `NEXT_PUBLIC_*` variable as visible to anyone using the app.
5. Use managed deployment secrets and short-lived workload identity where possible.
6. Never paste tokens into issues, pull requests, fixtures, screenshots, logs, or chat.

Suggested categories, introduced only when needed:

```text
APP_BASE_URL
DATABASE_URL
REDIS_URL
QUEUE_ENDPOINT
OBJECT_STORAGE_ENDPOINT
IDENTITY_ISSUER
IDENTITY_CLIENT_ID
AI_PROVIDER_ENDPOINT
SANDBOX_ENDPOINT
OTEL_EXPORTER_OTLP_ENDPOINT
```

Secret values such as database passwords, identity client secrets, AI keys, sandbox keys, email keys, and object-storage credentials remain server-only and are never added to `.env.example` as realistic values.

## Branch and pull-request workflow

1. Start from updated `main`.
2. Create a short-lived branch such as `feat/persistent-attempts`.
3. Keep changes focused on one roadmap work package.
4. Add or update tests with behavior changes.
5. Update affected docs and [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md).
6. Run local validation.
7. Open a pull request describing behavior, risks, evidence, migration, telemetry, and rollback.
8. Merge only after required checks and review pass.

Do not commit directly to protected `main` once branch protection is enabled.

## Issue template

Every implementation issue should include:

```markdown
## Outcome
What user or operator capability exists when this closes?

## Scope
What is included and explicitly excluded?

## Dependencies
Which roadmap packages, ADRs, providers, or schemas must exist first?

## Acceptance criteria
- [ ] Observable user behavior
- [ ] Failure and empty states
- [ ] Authorization and abuse controls
- [ ] Accessibility behavior
- [ ] Telemetry and redaction
- [ ] Rollout and rollback

## Validation
Unit, integration, contract, E2E, security, accessibility, and manual checks.

## Data lifecycle
Stored fields, retention, export, deletion, and migration impact.
```

## Coding boundaries

### UI

- Components render state and invoke application contracts; they do not own durable domain rules.
- Preserve semantic HTML, keyboard operation, focus behavior, 320px reflow, and screen-reader announcements.
- Use established icons with accessible names for controls.
- Keep responsive layout checks in browser tests.

### Domain

- Put entities, policies, scoring, state transitions, and invariants in framework-independent modules.
- Make time, IDs, randomness, and provider calls injectable at test boundaries.
- Version rules whose output is stored or shown later.

### API

- Parse all external input through shared schemas.
- Authorize object ownership in application services, not only route middleware.
- Make retried mutations idempotent.
- Return stable error codes and correlation IDs without leaking internals.

### Persistence

- Use migrations reviewed with application changes.
- Prefer expand-and-contract schema changes.
- Keep learner revisions and published content versions append-only.
- Test repositories against a real ephemeral PostgreSQL instance.

### Workers and providers

- Hide AI, sandbox, email, push, object storage, and queue SDKs behind narrow adapters.
- Add timeouts, bounded retries, circuit breakers, quotas, and observable failure classes.
- Do not let provider payloads become the product’s canonical domain model.

## Testing strategy

| Change | Minimum evidence |
|---|---|
| Pure domain rule | Unit tests including boundary cases |
| Parser/AST | Fixture, round-trip, property, and migration tests |
| Database repository | Real PostgreSQL integration tests |
| API behavior | Contract plus authorization tests |
| User journey | Browser E2E at desktop and mobile viewport |
| AI evaluator | Schema tests, adversarial fixtures, gold-set regression |
| Sandbox | Contract tests plus malicious/resource-limit suite |
| Notification | Scheduling/idempotency tests and provider contract tests |
| Infrastructure | Format/validate/plan plus policy and security scan |
| Accessibility-sensitive UI | Automated checks and manual keyboard/screen-reader evidence |

Tests must not call paid providers by default. Record sanitized contract fixtures or use provider test environments.

## Content workflow

Every published learning item must include:

- Original or approved licensed prompt and examples.
- Learning objective and prerequisites.
- Accepted strategy families and semantic requirements.
- Edge-case families and counterexamples.
- Expected complexity and common misconceptions.
- Graduated hints and non-default reference solution.
- Author, reviewer, rights/provenance metadata, approval date, and immutable version.

CI validates content schemas and test fixtures. Publication requires subject-matter, editorial, and rights review.

## Database changes

For each migration:

1. Add backward-compatible schema.
2. Deploy code that tolerates old and new states.
3. Backfill asynchronously with progress and restartability.
4. Switch reads behind a feature flag where risk warrants it.
5. Remove obsolete schema in a later release.
6. Document restore/forward-fix strategy; do not assume a destructive down migration is safe.

## Security checks

Before pushing:

```bash
# Full Git history and working tree
gitleaks git --redact

# JavaScript dependencies
cd apps/web
npm audit
```

Do not blindly run `npm audit fix --force`; inspect whether it proposes a major downgrade or incompatible graph. Container and infrastructure scans become required in CI before production promotion.

If a credential is exposed:

1. Revoke or rotate it immediately.
2. Determine where it was available and inspect usage logs.
3. Remove it from current code and deployment configuration.
4. Clean Git history only through an approved incident process.
5. Document impact, remediation, and prevention.

## Observability conventions

- Use structured events, not concatenated log strings.
- Include correlation ID, operation, version, duration, outcome, and safe identifiers.
- Exclude raw prompts, pseudocode, code, email, tokens, cookies, and provider authorization.
- Measure user outcomes and evaluator quality, not only engagement.
- Add dashboards and alert/runbook links with every new production dependency.

## Deployments

### Current Vercel app

From `apps/web`:

```bash
npx vercel@latest       # preview after the first project deployment
npx vercel@latest --prod
```

The project now requires the runtime environment variables listed in
`apps/web/.env.example` (Postgres connection, `AUTH_SECRET`, and OAuth provider
credentials). Set these as Vercel project environment variables before the
first deploy. Connect the GitHub repository with `apps/web` as Vercel's root
directory for automatic deployments.

### Target delivery flow

1. Pull request builds and tests immutable artifacts and an isolated preview.
2. Merge deploys the verified artifact to development.
3. Integration and synthetic tests promote it to staging.
4. Production requires approval while the product is early-stage.
5. Release metadata records commit, artifact digest, schema, content, rubric, evaluator, and operator.
6. Canary or blue/green rollout observes user-impact and evaluator-quality guardrails.
7. Rollback shifts traffic to the prior compatible artifact; database changes use forward fixes where possible.

## Root commands to add during Phase 0

Once workspace tooling is introduced, expose these stable commands from the repository root:

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run security:scan
npm run content:validate
```

Until that migration lands, use the current `apps/web` commands documented above.

## Release checklist

- Locked clean build succeeds.
- Required tests, accessibility checks, and synthetic journey pass.
- Secret, dependency, static, container, and IaC scans meet policy.
- Migration and rollback/forward-fix plan is reviewed.
- Content and evaluator gold-set validation passes.
- Dashboards, alerts, budgets, and runbooks cover changed dependencies.
- Privacy, retention, export, and deletion behavior is correct.
- Feature flag, canary, or rollback exists for risky behavior.
- Release record contains all artifact and schema versions.

# Contributing to Method

Contributions should improve a complete learner or instructor workflow and keep
main deployable. Start with [usage](docs/USAGE.md), [architecture](docs/ARCHITECTURE.md),
and [development conventions](docs/CONVENTIONS.md).

## First development session

1. Read [README](README.md) for the product and [usage](docs/USAGE.md#local-setup)
   for the local setup. Build the shared workspaces before starting development.
2. Explore guest practice: describe an approach, evaluate it, edit and reload the
   draft, then open the dashboard and roadmap. Leave sandbox execution disabled.
3. Read [architecture](docs/ARCHITECTURE.md), then trace one workflow through its
   UI, API, domain policy, and repository using the map below.
4. Run focused tests for that area. Database tests need Docker; browser tests need
   a production build and installed Chromium as described in
   [validation](docs/CONVENTIONS.md#validation).
5. Ask the maintainer for approved development account access and privately shared
   project goals, delivery history, and roadmap context before choosing larger work.

Distinguish an editable draft, accepted submission, verified result, published
academic grade, and learning estimate. A manual continuation button does not award
a grade. A browser save does not establish account persistence. Account estimates
use server evidence; guest estimates remain local.

## Choose work

Check open issues, pull requests, and existing code before starting. Use an
existing issue or propose a focused issue describing the problem, desired
behavior, affected area, and acceptance evidence. Coordinate substantial changes
with maintainers. Detailed product plans and internal implementation notes are
maintained locally and are not part of the public documentation contract.

| Area | Main locations |
|---|---|
| Learning content and roadmap | apps/web/src/lib/content.ts, apps/web/src/lib/roadmap.ts |
| Practice and feedback | apps/web/src/components/practice-workspace.tsx, practice APIs, evaluator fixtures |
| Code verification | apps/web/src/lib/code-grading.ts, apps/web/src/lib/sandbox |
| Account learning and reviews | apps/web/src/lib/learning-api.ts, packages/domain/src/learning-evidence.ts, database learning-evidence repository |
| Guest continuity and profiles | apps/web/src/lib/learner-continuity.ts, local-learner and local-mastery modules |
| Quiz authoring and question bank | apps/web/src/lib/question-bank.server.ts, assessment-draft and quiz-assignment repositories |
| Classes and grading | /teach, /classes, classroom and gradebook repositories |
| Authentication and administration | apps/web/src/lib/auth, apps/web/src/lib/admin |
| Persistence | packages/database/src, packages/database/migrations |

An analysis question becomes a verified coding activity only when its supported
languages, grading specification, server tests, and persisted content ID exist.
Publish original or approved licensed content with clear provenance.

## Workflow

1. Refresh main and inventory existing branches and pull requests.
2. Use a short-lived feat/, fix/, docs/, test/, or chore/ branch with one outcome.
3. Follow existing boundaries and preserve unrelated local work.
4. Add evidence for meaningful behavior changes: ownership, retries, failures,
   data persistence, and accessibility where applicable.
5. Update only the public guides affected by changed behavior or setup.
6. Run the relevant checks and pnpm preflight before declaring a change ready.
7. Open a focused pull request; resolve required checks and review before merge.

Use Conventional Commit subjects, such as feat(classes): improve assignment
submission or fix(grading): preserve a published score on reload.

## Pull requests

Explain the user problem and resulting behavior. Include an issue reference,
relevant validation, failure/authorization behavior, and any migration,
configuration, rollout, or recovery requirements. Provide sanitized screenshots
or preview evidence for visible changes. Record unresolved follow-up work in an
issue without publishing detailed internal plans.

Use forward migrations for schema changes. Do not rewrite published migrations,
silently reinterpret historical grades, or expose hidden tests and answer keys.
Keep provider calls behind adapters and avoid paid services in default tests.
Local bootstrap changes also need `pnpm test:local-bootstrap`; the database suite
verifies compatibility setup against disposable PostgreSQL, without real accounts.

## Documentation and sensitive material

The public guides are listed in [README.md](README.md). Run pnpm docs:check to
verify the tracked-file allowlist and public links. Changes to that allowlist
need a clear maintainer-reviewed public purpose.

Keep plans, local agent instructions, scratch notes, exports, recordings,
generated documents, and test artifacts out of Git. Ignore rules do not untrack
existing files. Never commit credentials, environment files, learner data, or
production database dumps. Report sensitive issues through [SECURITY.md](SECURITY.md).

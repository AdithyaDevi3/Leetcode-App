# Contributing to Method

Contributions should improve a complete learner or instructor workflow and keep
main deployable. Start with [usage](docs/USAGE.md), [architecture](docs/ARCHITECTURE.md),
and [development conventions](docs/CONVENTIONS.md).

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
| Profiles and recommendations | Learner APIs, learner-continuity and local-mastery modules |
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

## Documentation and sensitive material

The public guides are listed in [README.md](README.md). Run pnpm docs:check to
verify the tracked-file allowlist and public links. Changes to that allowlist
need a clear maintainer-reviewed public purpose.

Keep plans, local agent instructions, scratch notes, exports, recordings,
generated documents, and test artifacts out of Git. Ignore rules do not untrack
existing files. Never commit credentials, environment files, learner data, or
production database dumps. Report sensitive issues through [SECURITY.md](SECURITY.md).

# Contributing to Method

Method is a pseudocode-first algorithm learning application. Contributions
should improve a complete learner or operator workflow and keep `main`
deployable.

## Before choosing work

1. Read [README.md](README.md) for the product and current learner experience.
2. Read [docs/USAGE.md](docs/USAGE.md) for working behavior and common change
   locations.
3. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing data,
   authentication, evaluation, execution, or deployment boundaries.
4. Check open issues and pull requests. Comment on an existing issue before
   starting it. For substantial untracked work, open an issue that states the
   user problem, intended behavior, acceptance evidence, and affected area.

The implementation roadmap describes long-term direction. It does not prove
that a capability is live. Use `main`, the usage guide, and merged tests as the
source of truth.

## What exists

The repository currently contains these working product areas:

| Area | Main locations |
|---|---|
| Algorithm curriculum and algorithm/system-design roadmap | `apps/web/src/lib/content.ts`, `apps/web/src/lib/roadmap.ts`, `/practice`, `/roadmap` |
| Pseudocode analysis, reference answers, and feedback | `apps/web/src/lib/content.ts`, `apps/web/src/lib/evaluator.ts`, evaluation quality fixtures, practice evaluation APIs |
| Python 3, C++20, and TypeScript verification | `apps/web/src/lib/sandbox`, execution APIs, activity test suites |
| Learner profiles and recommendations | onboarding, `/learn`, dashboard, mastery and local learner modules |
| Classes and assigned practice | `/admin/classes`, `/classes`, classroom repository and migration |
| Authentication and persistence | Supabase Auth, PostgreSQL repositories and migrations |
| Administration | `/admin`, database roles, server authorization, audit events |

The roadmap browser provides analysis exercises. Only roadmap questions linked
to a practice activity open the coding workspace. Adding a roadmap question
does not create a verified coding activity by itself.

## Work that needs contribution

Good next contributions are coherent slices with clear evidence:

- Add original practice activities so each roadmap level can continue from
  written analysis into verified Python 3, C++20, and TypeScript code.
- Move the reviewed question catalog into versioned database content with an
  authored import/publish workflow, pagination, and server-side search so the
  catalog can grow beyond the initial 48 questions.
- Expand evaluator gold sets with expert-labeled correct, alternative, partial,
  contradictory, and adversarial explanations. Improve rules only when the new
  cases demonstrate a real false acceptance or false rejection.
- Persist roadmap progress for signed-in learners and reconcile it with local
  guest progress during account upgrade.
- Add class editing, code rotation, archiving, individual assignments, and
  instructor controls with authorization and audit coverage.
- Complete staging evidence for durable evaluation workers, execution limits,
  backups, rate limits, alerts, accessibility, and recovery behavior.
- Build accessible system-design diagramming and rubric feedback.

Open or update an issue before starting one of these areas so scope and
acceptance criteria are visible. Avoid broad phase branches or unrelated work in
one pull request.

## Keep the work map current

Every pull request must review the two sections above and the matching status in
`README.md`, `docs/USAGE.md`, and the requirements matrix.

- Move delivered work from “Work that needs contribution” into “What exists”
  only after the implementation, tests, and required operational evidence are
  present on the pull request branch.
- Add newly discovered follow-up work to “Work that needs contribution” when it
  is concrete, still required, and not already tracked by an issue.
- Remove or rewrite stale items when scope changes. Do not leave both the old
  and replacement descriptions.
- Link the issue or pull request that owns unfinished work. If no issue exists,
  create one before merging a contribution that introduces the new obligation.
- In the pull request description, state either which work-map entries changed
  or “Work map reviewed; no change required,” with a short reason.

A visible interface is not sufficient evidence that work is complete. Include
persistence, authorization, accessibility, failure handling, security,
deployment, and operational proof when those concerns apply.

## Local setup

Requirements: Node.js 20 or newer, pnpm 9, Git, and Docker for database
integration tests.

```bash
git clone https://github.com/AdithyaDevi3/Leetcode-App.git
cd Leetcode-App
corepack enable
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm db:up
pnpm migrate
pnpm dev
```

Use placeholders and local credentials only. Never commit `.env` files,
provider credentials, learner data, evaluation submissions, or database dumps.

## Branch and change workflow

Create a short-lived branch from current `main`:

```bash
git fetch origin main --prune
git switch main
git rebase origin/main
git switch -c feat/short-description
```

Use `feat/`, `fix/`, `docs/`, `test/`, or `chore/` prefixes. Keep one outcome per
branch. Preserve existing migrations; add a forward migration for schema
changes. Use server-side authorization for protected operations and keep direct
browser database access denied unless a reviewed RLS policy explicitly allows
it.

Follow the existing code style:

- Keep TypeScript strict and avoid `any`.
- Reuse established domain types, repositories, UI tokens, and focus states.
- Keep learner text and implementation details out of logs and audit metadata.
- Add tests for meaningful behavior, ownership, failure handling, and security
  boundaries. Avoid tests that only repeat the implementation.
- Update public documentation when behavior, setup, architecture, or tradeoffs
  change.

Use Conventional Commit subjects, for example:

```text
feat(roadmap): add graph analysis levels
fix(evaluation): reject contradictory pointer movement
docs: clarify migration verification
```

## Validation

Run the repository gate before opening a pull request:

```bash
pnpm preflight
```

During development, use the smallest relevant commands:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
pnpm --filter @leetcode-app/database test
```

Database tests require Docker. UI changes should also receive keyboard and
responsive checks. Evaluation changes must update the gold set and quality
metrics, with extra attention to false acceptances.

## Pull requests

A pull request should include:

- the user problem and resulting behavior;
- the issue or requirement it addresses;
- focused implementation and explicit non-goals;
- tests and manual evidence appropriate to the risk;
- screenshots or a preview for visible UI changes;
- migration order, rollout, failure behavior, and forward-fix plan when data or
  deployment changes;
- documentation updates for changed behavior;
- the work-map update, or the required no-change statement.

Keep the branch current with its declared base. CI, security scanning, and the
preview deployment must pass. Resolve review conversations and required
approvals before merge. Maintainers merge in dependency order and remove merged
branches and worktrees after verifying deployment when applicable.

## Content and evaluation rules

All problem statements, examples, explanations, and tests must be original or
properly licensed. Do not scrape or reproduce third-party problem text.

Text evaluation is a learning aid. A rule should identify specific algorithmic
evidence, give a useful revision, reject known contradictions, and fail closed
when no rubric exists. Do not approve an answer solely because it contains a
list of expected words. Executable tests remain the completion evidence for
coding activities.

## Help and conduct

Be respectful, explain review feedback with evidence, and keep discussion about
the work. Use a GitHub issue for bugs and scoped proposals, and a GitHub
Discussion for open-ended questions. Contributions use the repository license.

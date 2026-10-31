# Method

Method is a pseudocode-first algorithm learning application. Learners describe
an approach, receive deterministic feedback, and optionally verify Python 3,
C++20, or TypeScript code against server-owned tests.

The application includes ten original coding activities, a 48-question analysis
roadmap, and a 60-question assignable multiple-choice bank. Guests can practice
locally; signed-in learners retain their work and can take a separate ten-question
skills check. Released quiz results, answered skills-check items, and newly
verified practice inform explained recommendations and spaced reviews.

Instructors and authorized administrators can draft and assign quizzes to a class
or selected enrolled learners. Learners save answers, submit once, and see scores
after instructor release. Coding assignments, rubric grades, corrections, and
grade-review requests have separate durable histories. Administration permissions
remain separate from access to private grades.

Class owners can inspect released-quiz concept coverage and open editable
follow-up quizzes. Authorized administrators have a separate aggregate view that
hides concept statistics below the minimum learner count. Personal practice and
skills-check results stay outside class reports.

## Public documentation

| Guide | Purpose |
|---|---|
| [Usage](docs/USAGE.md) | Local setup, current learner/teaching workflows, configuration, and troubleshooting |
| [Contributing](CONTRIBUTING.md) | Selecting work, development workflow, validation, and pull requests |
| [Architecture](docs/ARCHITECTURE.md) | Current components, data ownership, trust boundaries, and tradeoffs |
| [Development conventions](docs/CONVENTIONS.md) | Code, API, database, testing, release, and documentation rules |
| [Personal use](docs/PERSONAL_USE.md) | Local operation, data responsibilities, and hosted-service limits |
| [Security](SECURITY.md) | Private vulnerability reporting and supported code |

This is the complete public documentation set. Detailed plans, implementation
notes, internal checklists, and generated artifacts are local working material.
The documentation check enforces the public file allowlist, including the
repository's issue and pull-request templates.

## Run locally

Use Node.js 24, pnpm 9-compatible tooling, and Docker for database-backed paths.
From the repository root:

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

Open <http://localhost:3000>. The example defaults to local guest development;
leave Auth values blank and the hosted database URL commented for this path.
Account features need approved development Supabase settings. Keep code execution
disabled for ordinary local development. New contributors should follow the
[first development session](CONTRIBUTING.md#first-development-session).

```bash
pnpm docs:check
pnpm preflight
```

The health endpoint is GET /api/health. Production code verification requires a
configured isolated execution provider; it is not ordinary application-server
execution. See [usage](docs/USAGE.md) and [architecture](docs/ARCHITECTURE.md).

## Content

Use original or properly licensed questions and examples. Method is not
affiliated with LeetCode and should not scrape or republish its problem library.

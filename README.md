# Method

Method is a pseudocode-first algorithm learning application. Learners describe
an approach, receive deterministic feedback, and optionally verify Python 3,
C++20, or TypeScript code against server-owned tests.

The current application includes ten original practice activities, a 48-question
algorithm/system-design analysis roadmap, guest drafts, account persistence,
profiles, recommendations, and spaced reviews. Some learning estimates remain
device-local. Instructors can create classes, assign existing activities, review
submissions, and publish rubric grades. Learners can inspect their published
grades and request review. A separate role-scoped administration portal manages
platform operations and classes.

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
pnpm db:up
pnpm db:bootstrap
pnpm dev
```

Open <http://localhost:3000>. Guest UI exploration works without a hosted Auth
configuration; account features need the documented Supabase settings. Keep code
execution disabled for ordinary local development.

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

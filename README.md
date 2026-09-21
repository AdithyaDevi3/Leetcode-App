# Method Algorithm Learning App

A working pseudocode-first learning application for algorithms, data structures,
and system-design practice. The deployed learner experience supports guest
practice, deterministic feedback, TypeScript and Python verification, and
rules-based personalization.

The app is designed to teach problem-solving before syntax. Learners can practice concepts, express solutions in structured English or visual blocks, receive evaluation and targeted feedback, and only then move into executable code when they choose the pseudocode-to-code workflow.

## Documentation

Start with [docs/README.md](docs/README.md) for the complete documentation map. The core documents are:

- [Maintainer quick start](docs/USAGE.md) for what works today, local setup,
  common change locations, known launch gaps, and the takeover checklist.
- [Product plan](docs/PRODUCT_PLAN.md) for vision, learning model, complete scope, security controls, and release gates.
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md) for dependency-ordered phases, issue-sized work packages, and the next 12 issues.
- [Current and target architecture](docs/ARCHITECTURE.md) for deployed providers,
  domains, data, runtime boundaries, APIs, sandboxing, and future boundaries.
- [Administration and learner architecture](docs/ADMIN_ARCHITECTURE.md) and
  [use cases](docs/ADMIN_USE_CASES.md) for the current operator workflows,
  permissions, learner interactions, and remaining capabilities.
- [Development and contribution conventions](docs/DEVELOPMENT.md) for setup,
  validation, workflow, testing, migrations, security, and deployment.
- [Contribution guide](CONTRIBUTING.md) for current product areas, remaining
  work, work-map maintenance, validation, and pull request expectations.
- [Administration-console decision](docs/adr/011-current-platform-and-admin-console.md)
  for the secure delivery sequence and non-goals.
- [Requirements matrix](docs/REQUIREMENTS_MATRIX.md) for stable requirement IDs, current status, target phase, and acceptance evidence.

## Current learner application

The first deployable product slice lives in [apps/web](apps/web). It includes:

- Ten original algorithm activities spanning hashing, windows, trees, stacks, graphs, queues, two pointers, and dynamic programming.
- A browseable roadmap with 48 foundation, intermediate, and advanced analysis
  questions across eight algorithm and eight system-design topics, with search,
  filters, and device-local progress.
- Structured-English and semantic-block pseudocode modes.
- Local profiles, history-aware practice recommendations, and draft autosave for guest learners.
- Deterministic, activity-specific reasoning evaluation for every algorithm
  activity, including explicit contradiction checks and fail-closed rubric selection.
- Server-side TypeScript and Python verification against activity-specific test suites before a solution can be marked complete.
- Local concept-mastery evidence that adjusts practice recommendations as the learner improves.
- TypeScript and Python coding starters that follow the learner's local language preference.
- Responsive desktop and mobile layouts.
- A role-scoped administration portal with live operational summaries, safe
  queue views, audited operator-role changes, and deny-by-default Supabase RLS.
- Administrator-created classes with join codes, learner enrollment, assigned
  practice activities, due dates, and completion progress.
- Unit tests, CI, a health endpoint, and a non-root production container.

Run it locally from the repository root:

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

Then open `http://localhost:3000`.

Validation commands:

```bash
pnpm preflight
```

Build and run the production container:

```bash
cd apps/web
docker build -t method-web .
docker run --rm -p 3000:3000 method-web
```

The service health check is available at `GET /api/health`.

### Current security note

The project pins Next.js `16.3.2`. The vulnerable transitive Sharp release is overridden to patched version `0.35.3`. Do not use npm's suggested forced downgrade to Next.js 9.

## Content and trademark note

The product should use original or properly licensed problem statements, examples, explanations, and system-design material. It should not scrape, republish, or imply affiliation with LeetCode. Product naming and marketing should avoid third-party trademarks unless permission has been obtained.

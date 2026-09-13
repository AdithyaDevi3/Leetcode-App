# Algorithm Learning App

A product and engineering plan for a pseudocode-first learning platform focused on algorithms, data structures, and system design.

The app is designed to teach problem-solving before syntax. Learners can practice concepts, express solutions in structured English or visual blocks, receive evaluation and targeted feedback, and only then move into executable code when they choose the pseudocode-to-code workflow.

## Documentation

Start with [docs/README.md](docs/README.md) for the complete documentation map. The core documents are:

- [Product plan](docs/PRODUCT_PLAN.md) for vision, learning model, complete scope, security controls, and release gates.
- [Implementation roadmap](docs/IMPLEMENTATION_ROADMAP.md) for dependency-ordered phases, issue-sized work packages, and the next 12 issues.
- [Target architecture](docs/ARCHITECTURE.md) for domains, data, runtime boundaries, APIs, AI evaluation, sandboxing, and environments.
- [Development guide](docs/DEVELOPMENT.md) for setup, validation, workflow, testing, migrations, security, and deployment.
- [Requirements matrix](docs/REQUIREMENTS_MATRIX.md) for stable requirement IDs, current status, target phase, and acceptance evidence.

## Walking skeleton

The first deployable product slice lives in [apps/web](apps/web). It includes:

- Ten original algorithm activities spanning hashing, windows, trees, stacks, graphs, queues, two pointers, and dynamic programming.
- Structured-English and semantic-block pseudocode modes.
- Local profiles, history-aware practice recommendations, and draft autosave for guest learners.
- Deterministic, activity-specific reasoning evaluation for every algorithm activity.
- TypeScript and Python coding starters that follow the learner's local language preference.
- Responsive desktop and mobile layouts.
- Unit tests, CI, a health endpoint, and a non-root production container.

Run it locally:

```bash
cd apps/web
npm install
npm run dev
```

Then open `http://localhost:3000`.

Validation commands:

```bash
cd apps/web
npm run lint
npm test
npm run build
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

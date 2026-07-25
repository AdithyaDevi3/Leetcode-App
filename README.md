# Algorithm Learning App

A product and engineering plan for a pseudocode-first learning platform focused on algorithms, data structures, and system design.

The app is designed to teach problem-solving before syntax. Learners can practice concepts, express solutions in structured English or visual blocks, receive evaluation and targeted feedback, and only then move into executable code when they choose the pseudocode-to-code workflow.

## Planning document

See [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) for the product scope, learning model, architecture, security controls, deployment strategy, roadmap, and release criteria.

## Walking skeleton

The first deployable product slice lives in [apps/web](apps/web). It includes:

- An original hash-map lesson and practice problem.
- Structured-English and semantic-block pseudocode modes.
- Local draft autosave for guest learners.
- Deterministic, evidence-based reasoning evaluation.
- A coding workspace that unlocks only after the plan passes.
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

Next.js `16.2.11`, the latest stable release as of July 25, 2026, pins a PostCSS version covered by current npm advisories. The application does not accept or compile user-controlled CSS, which limits exposure, but production deployment should remain gated on an upstream patched stable Next.js release. The vulnerable transitive Sharp release is overridden to patched version `0.35.3`. Do not use npm's suggested forced downgrade to Next.js 9.

## Content and trademark note

The product should use original or properly licensed problem statements, examples, explanations, and system-design material. It should not scrape, republish, or imply affiliation with LeetCode. Product naming and marketing should avoid third-party trademarks unless permission has been obtained.
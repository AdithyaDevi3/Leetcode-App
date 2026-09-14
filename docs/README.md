# Documentation

This directory is the source of truth for what the product should do, how it should be built, and how completion is proven.

Use the maintainer quick start for deployed reality. Product plans and roadmap
documents include future scope and must not be read as proof that a feature is
live.

## Start here

| Document | Use it for |
|---|---|
| [Maintainer quick start](USAGE.md) | Current production behavior, local setup, code map, common changes, launch gaps, and takeover checklist |
| [Product plan](PRODUCT_PLAN.md) | Vision, learning model, complete scope, security posture, release gates, and success metrics |
| [Implementation roadmap](IMPLEMENTATION_ROADMAP.md) | Dependency-ordered phases, issue-sized work packages, acceptance checks, and the next 12 issues |
| [Current and target architecture](ARCHITECTURE.md) | Deployed providers plus repository/runtime boundaries, domains, data, APIs, security boundaries, and ADRs |
| [Development guide](DEVELOPMENT.md) | Local setup, validation, issue/PR workflow, coding boundaries, tests, migrations, security, and deployment |
| [External deployment setup](DEPLOYMENT_SETUP.md) | Provider provisioning, secrets, workers, observability, launch order, and integrations that remain disabled until safely configured |
| [Preflight checks](PREFLIGHT.md) | Running the same checks CI runs, locally, before opening a pull request |
| [Requirements matrix](REQUIREMENTS_MATRIX.md) | Stable requirement IDs, current status, target phase, and acceptance evidence |

## Recommended reading order

### Product or design work

1. Product plan sections 1-12.
2. Requirements matrix for current status.
3. Relevant implementation-roadmap phase.

### Engineering work

1. Maintainer quick start.
2. Development guide.
3. Current and target architecture.
4. Relevant ADR, including
   [ADR-011 for administration](adr/011-current-platform-and-admin-console.md).
5. Requirements matrix IDs named by the issue.
6. Product-plan section for deeper context and release constraints.

### Release or operations work

1. Product plan sections 16-20 and 26.
2. Development-guide release checklist.
3. Architecture environment and security boundaries.
4. Requirements matrix platform/privacy rows.

## Document ownership

- Product scope and success metrics: product owner.
- Curriculum, rubrics, and evaluator thresholds: learning/content owner.
- Architecture and development workflow: engineering owner.
- Security, privacy, deployment, and runbooks: named security/platform owners.
- Requirement status: the pull request implementing or changing the requirement.

Every material decision needs an owner and review date. Record architectural choices in `docs/adr/` using the format described in the architecture guide once ADR work begins.

## Keeping documentation current

A pull request is incomplete when it changes behavior but leaves these documents inaccurate.

- Update the product plan when scope or product policy changes.
- Update the roadmap when dependencies, sequencing, providers, or exit criteria change.
- Update architecture when boundaries, contracts, data ownership, or runtime topology change.
- Update the development guide when commands or contributor workflow change.
- Update requirement status and acceptance evidence in the matrix with every implemented capability.

Do not mark a capability implemented solely because its interface is visible. Persistence, authorization, failure handling, accessibility, security, privacy, telemetry, and operational evidence remain part of the requirement where applicable.

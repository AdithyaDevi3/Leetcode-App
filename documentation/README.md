# Leetcode-App Internal Documentation

**Last Updated:** 2026-08-18  
**Current Phase:** Phase 1.3 - Identity and Guest Upgrade (Complete)

## Overview

This is the comprehensive internal documentation for the Leetcode-style learning application. This folder is gitignored and contains detailed technical documentation, design decisions, tradeoffs, and implementation notes.

## Documentation Index

### Core Documentation
- [**System Design**](./SYSTEM_DESIGN.md) - High-level architecture, component interactions, data flow
- [**Tech Stack**](./TECH_STACK.md) - Technologies used and rationale for each choice
- [**Tradeoffs**](./TRADEOFFS.md) - Design decisions, alternatives considered, pros/cons
- [**Database Schema**](./DATABASE_SCHEMA.md) - Complete database design, migrations, indexes

### Implementation Details
- [**Authentication System**](./AUTHENTICATION.md) - NextAuth.js setup, OAuth flows, session management
- [**Testing Strategy**](./TESTING_STRATEGY.md) - Test coverage, testing patterns, CI/CD
- [**Security**](./SECURITY.md) - Security requirements, threat model, mitigations
- [**Development Workflow**](./DEVELOPMENT_WORKFLOW.md) - How to develop, debug, and deploy

### Tooling & Configuration
- [**Tooling**](./TOOLING.md) - Development tools, linters, formatters, IDE setup
- [**Monorepo Structure**](./MONOREPO.md) - Workspace organization, package dependencies

## Project Status

### Completed Phases

#### Phase 1.1: Domain Contracts ✅
- Defined all TypeScript interfaces for domain entities
- Established repository patterns
- Created core types for practice sessions, evaluations, content

#### Phase 1.2: PostgreSQL & Migrations ✅
- Set up PostgreSQL with connection pooling
- Implemented 4 repository interfaces with optimistic concurrency control
- Created 11-table database schema
- Added comprehensive integration tests (20+ tests)
- Seed data for Hash Map problem

#### Phase 1.3: Identity and Guest Upgrade ✅
- NextAuth.js authentication with Google and GitHub OAuth
- Database-backed sessions with secure cookies
- Guest session support with HTTP-only cookies
- Deterministic guest-to-user upgrade with data merge
- Session listing and revocation APIs
- Comprehensive security tests (CSRF, session fixation, ownership, etc.)

### Current Work
- Finalizing Phase 1.3 commit
- Preparing for Phase 1.4: Content Integration

### Next Phases
- Phase 1.4: Content Integration
- Phase 1.5: Evaluation System
- Phase 1.6: Testing & Refinement
- Phase 2: Enhanced Features
- Phase 3: Polish & Deploy

## Quick Links

- [Implementation Roadmap](../docs/IMPLEMENTATION_ROADMAP.md)
- [Product Plan](../docs/PRODUCT_PLAN.md)
- [Requirements Matrix](../docs/REQUIREMENTS_MATRIX.md)
- [Architecture Overview](../docs/ARCHITECTURE.md)

## Key Metrics

### Codebase Stats (Phase 1.3)
- **Total Files:** ~60 files
- **Lines of Code:** ~5,000 LOC (excluding tests)
- **Test Files:** 7 test suites
- **Test Cases:** 40+ tests
- **Database Tables:** 14 tables (11 domain + 3 auth)
- **API Endpoints:** 6 endpoints

### Test Coverage Goals
- Unit Tests: >80% coverage
- Integration Tests: All repositories and APIs
- Security Tests: All auth requirements validated
- E2E Tests: Critical user flows (Phase 1.6)

## Development Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                    # Start Next.js dev server
pnpm test                   # Run all tests
pnpm test:watch            # Watch mode for tests

# Database migrations
pnpm migrate:create        # Create new migration
pnpm migrate:up            # Apply migrations
pnpm migrate:down          # Rollback migration

# Linting & Type checking
pnpm lint                  # ESLint
pnpm typecheck            # TypeScript type checking

# Build
pnpm build                # Build for production
```

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js App (Web)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Pages     │  │   API Routes │  │   Components     │  │
│  │  (App Dir)  │  │  (Auth, etc) │  │  (React/TSX)     │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   Packages (Shared Logic)                   │
│  ┌──────────────────────┐  ┌───────────────────────────┐  │
│  │   Domain Package     │  │   Database Package        │  │
│  │  (Types, Contracts)  │  │  (Repos, Migrations)      │  │
│  └──────────────────────┘  └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                        │
│  - Users & Guest Identities                                 │
│  - Authentication (Accounts, Sessions, Tokens)              │
│  - Content Items & Tags                                     │
│  - Practice Sessions & Attempts                             │
│  - Pseudocode Revisions & Evaluations                       │
│  - User Bookmarks & Progress                                │
└─────────────────────────────────────────────────────────────┘
```

## Contributing Guidelines

When updating this documentation:

1. **Keep it current:** Update documentation as you implement features
2. **Be specific:** Include code examples, diagrams, and concrete details
3. **Document decisions:** Explain WHY, not just WHAT
4. **Add timestamps:** Date significant updates
5. **Link references:** Cross-reference related docs

## Contact & Support

- **Project Lead:** [Add name]
- **Repository:** [Add URL]
- **Issue Tracker:** [Add URL]
- **Slack/Discord:** [Add channel]

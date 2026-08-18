# Tech Stack

**Last Updated:** 2026-08-18

## Overview

This document details every technology choice in the stack and the rationale behind each decision.

## Frontend

### Next.js 16.x
**Category:** React Framework  
**Version:** 16.2.11

**Why Next.js?**
- **Server-Side Rendering (SSR):** Improves SEO and initial load performance
- **App Router:** Modern routing with React Server Components
- **API Routes:** Co-locate frontend and backend in one codebase
- **File-Based Routing:** Intuitive page organization
- **Built-in Optimizations:** Image optimization, font optimization, code splitting
- **Vercel Integration:** Seamless deployment to Vercel platform

**Alternatives Considered:**
- **Create React App:** ❌ No SSR, no API routes, deprecated
- **Vite + React:** ❌ Requires separate backend, no built-in SSR
- **Remix:** ✅ Comparable, but Next.js has larger ecosystem and better docs

### React 19.x
**Category:** UI Library  
**Version:** 19.2.4

**Why React?**
- **Component-Based:** Reusable UI components
- **Large Ecosystem:** Vast library of packages and components
- **React Server Components:** Reduce client bundle size
- **Hooks:** Modern state management patterns
- **Strong TypeScript Support:** Excellent type definitions

**Alternatives Considered:**
- **Vue.js:** ✅ Good alternative, but smaller ecosystem
- **Svelte:** ✅ Better performance, but less mature for large apps
- **Angular:** ❌ Too heavy for this use case

### TypeScript 5.x
**Category:** Type System  
**Version:** 5.7.2

**Why TypeScript?**
- **Type Safety:** Catch bugs at compile time
- **IDE Support:** Excellent autocomplete and refactoring
- **Self-Documenting:** Types serve as inline documentation
- **Refactoring Confidence:** Rename/refactor without fear
- **Team Collaboration:** Clear contracts between modules

**Alternatives Considered:**
- **JavaScript:** ❌ No type safety, error-prone at scale
- **Flow:** ❌ Less popular, smaller ecosystem

### Tailwind CSS 4.x
**Category:** Styling  
**Version:** 4.x (via PostCSS plugin)

**Why Tailwind?**
- **Utility-First:** Rapid UI development
- **Consistency:** Design system enforced via utility classes
- **No CSS Bloat:** Unused classes purged in production
- **Responsive Design:** Mobile-first breakpoints
- **Dark Mode Support:** Built-in dark mode utilities

**Alternatives Considered:**
- **CSS Modules:** ✅ Good for isolated styles, but verbose
- **Styled Components:** ❌ Runtime overhead, SSR complexity
- **Sass/SCSS:** ❌ More boilerplate, harder to maintain

### Lucide React
**Category:** Icons  
**Version:** 1.26.0

**Why Lucide?**
- **Consistent Design:** Beautiful, modern icon set
- **Tree-Shakeable:** Import only icons you use
- **TypeScript Support:** Fully typed
- **React Components:** Easy to integrate
- **Active Maintenance:** Regular updates

**Alternatives Considered:**
- **React Icons:** ✅ More icons, but larger bundle
- **Heroicons:** ✅ Good alternative, similar quality
- **Font Awesome:** ❌ Heavier, not as modern

## Backend

### Next.js API Routes
**Category:** API Framework  
**Why?** See Next.js rationale above. Built-in, no separate server needed.

### NextAuth.js v5
**Category:** Authentication  
**Version:** 5.0.0-beta.25

**Why NextAuth?**
- **OAuth Integration:** Built-in Google, GitHub, etc. providers
- **Database Sessions:** Support for database-backed sessions
- **Security Best Practices:** CSRF protection, secure cookies
- **TypeScript Support:** Fully typed
- **Flexible Adapters:** Custom database adapters
- **Next.js Integration:** Designed specifically for Next.js

**Alternatives Considered:**
- **Auth0:** ❌ Third-party dependency, costs scale with users
- **Clerk:** ❌ Third-party, limited customization
- **Passport.js:** ❌ More manual setup, no built-in DB sessions
- **Custom Auth:** ❌ Too much complexity, security risks

### @auth/pg-adapter
**Category:** Auth Database Adapter  
**Version:** 2.8.0

**Why?**
- **PostgreSQL Integration:** Works with our database choice
- **Custom Extension:** We extend it with custom adapter for repository pattern
- **Type-Safe:** Fully typed for TypeScript

## Database

### PostgreSQL 15
**Category:** Relational Database  
**Version:** 15-alpine (Docker)

**Why PostgreSQL?**
- **ACID Compliance:** Reliable transactions
- **JSON Support:** JSONB for flexible schemas (preferences, metadata)
- **Performance:** Fast queries with proper indexes
- **Open Source:** No licensing costs
- **Mature Ecosystem:** Extensive tooling and documentation
- **Advanced Features:** CTEs, window functions, full-text search
- **Heroku/Vercel Support:** Easy deployment

**Alternatives Considered:**
- **MySQL:** ✅ Good alternative, but less feature-rich
- **MongoDB:** ❌ Document DB, harder to enforce relationships
- **SQLite:** ❌ Not suitable for concurrent users
- **Supabase:** ✅ PostgreSQL + REST API, but adds abstraction layer

### node-postgres (pg)
**Category:** Database Client  
**Version:** 8.13.1

**Why node-postgres?**
- **Connection Pooling:** Efficient connection management
- **Prepared Statements:** SQL injection prevention
- **Promise-Based:** Modern async/await API
- **Low-Level Control:** Direct SQL for complex queries
- **TypeScript Support:** Good type definitions

**Alternatives Considered:**
- **Prisma:** ❌ ORM overhead, less control over SQL
- **TypeORM:** ❌ Heavier, more abstraction
- **Drizzle:** ✅ Good alternative, type-safe query builder
- **Kysely:** ✅ Good alternative, type-safe SQL builder

### node-pg-migrate
**Category:** Database Migrations  
**Version:** 7.8.2

**Why node-pg-migrate?**
- **TypeScript Support:** Write migrations in TypeScript
- **Up/Down Migrations:** Reversible migrations
- **No ORM Dependency:** Works with raw SQL
- **Simple API:** Easy to use and understand

**Alternatives Considered:**
- **Prisma Migrate:** ❌ Requires Prisma ORM
- **TypeORM Migrations:** ❌ Requires TypeORM
- **db-migrate:** ✅ Similar, but less TypeScript support
- **Flyway:** ❌ Java-based, overkill for this project

## Testing

### Vitest
**Category:** Unit Testing  
**Version:** 4.1.10 (web), 2.1.8 (database)

**Why Vitest?**
- **Fast:** Extremely fast test execution
- **Jest-Compatible:** Familiar API for Jest users
- **ESM Support:** Native ES modules support
- **Vite Integration:** Shares config with Vite
- **TypeScript First:** No extra setup for TypeScript
- **Watch Mode:** Excellent developer experience

**Alternatives Considered:**
- **Jest:** ✅ More mature, but slower and ESM issues
- **Mocha:** ❌ Requires more setup
- **Ava:** ❌ Smaller ecosystem

### Testcontainers
**Category:** Integration Testing  
**Version:** 10.17.1

**Why Testcontainers?**
- **Real Database:** Test against actual PostgreSQL, not mocks
- **Isolated:** Each test suite gets fresh database
- **Docker-Based:** Easy to run locally and in CI
- **Automatic Cleanup:** Containers destroyed after tests
- **Reliable:** No flaky tests due to test data pollution

**Alternatives Considered:**
- **Mock Database:** ❌ Doesn't catch real DB issues
- **Shared Test DB:** ❌ Test pollution, race conditions
- **SQLite In-Memory:** ❌ Different SQL dialect than PostgreSQL

## Development Tools

### pnpm
**Category:** Package Manager  
**Version:** 9.0.0

**Why pnpm?**
- **Disk Efficiency:** Content-addressable store saves space
- **Fast:** Faster than npm and yarn
- **Workspace Support:** Built-in monorepo support
- **Strict:** Better dependency resolution than npm
- **Lock File:** Deterministic installs

**Alternatives Considered:**
- **npm:** ❌ Slower, less efficient
- **yarn:** ✅ Good alternative, but pnpm is faster
- **bun:** ❌ Too new, less stable

### ESLint 9
**Category:** Linting  
**Version:** 9.x

**Why ESLint?**
- **Industry Standard:** Most popular JavaScript linter
- **Extensible:** Plugins for React, TypeScript, Next.js
- **Customizable:** Configure rules to team preferences
- **IDE Integration:** Real-time feedback in VS Code

### TypeScript Compiler (tsc)
**Category:** Type Checking  
**Version:** 5.7.2

**Why tsc?**
- **Official TypeScript:** The authoritative type checker
- **Build Tool:** Transpile TypeScript to JavaScript
- **IDE Integration:** Powers VS Code IntelliSense

### tsup
**Category:** TypeScript Bundler  
**Version:** 8.3.5

**Why tsup?**
- **Fast:** Built on esbuild
- **Zero Config:** Works out of the box
- **Bundle Packages:** Build shared packages in monorepo
- **Tree Shaking:** Remove unused code

**Alternatives Considered:**
- **tsc:** ❌ No bundling, emits separate files
- **Rollup:** ✅ Good alternative, but slower
- **Webpack:** ❌ Too complex for library bundling

## Infrastructure (Planned)

### Vercel
**Category:** Hosting  
**Why Vercel?**
- **Next.js Native:** Built by Next.js creators
- **Automatic Deployments:** Git push to deploy
- **Edge Network:** Global CDN
- **Preview Deployments:** Every PR gets preview URL
- **Free Tier:** Generous free tier for development

**Alternatives Considered:**
- **Netlify:** ✅ Similar features
- **AWS Amplify:** ❌ More complex setup
- **Railway:** ✅ Good for PostgreSQL hosting
- **DigitalOcean:** ✅ Traditional VPS, more control

### Railway / Supabase (Database Hosting)
**Category:** PostgreSQL Hosting

**Why Railway?**
- **Simple Setup:** One-click PostgreSQL
- **Automated Backups:** Daily backups included
- **Free Tier:** Good for development
- **Easy Scaling:** Vertical scaling with slider

**Alternatives Considered:**
- **Supabase:** ✅ PostgreSQL + extras (auth, storage)
- **Heroku:** ✅ Easy but more expensive
- **AWS RDS:** ❌ More complex, requires AWS knowledge
- **Neon:** ✅ Serverless PostgreSQL, good alternative

## Monitoring (Planned)

### Sentry
**Category:** Error Tracking  
**Why Sentry?**
- **Source Maps:** Shows original TypeScript in errors
- **User Context:** Track which users hit errors
- **Performance Monitoring:** API latency tracking
- **Free Tier:** Generous free tier

**Alternatives Considered:**
- **LogRocket:** ✅ Session replay, but more expensive
- **Rollbar:** ✅ Similar features, smaller ecosystem
- **BugSnag:** ✅ Good alternative

## Summary

### Core Principles in Technology Selection

1. **TypeScript Everywhere:** Full-stack type safety from DB to UI
2. **Modern JavaScript:** ESM, async/await, no legacy Node.js patterns
3. **Minimal Abstraction:** Prefer direct SQL over heavy ORMs
4. **Developer Experience:** Fast feedback loops, great tooling
5. **Production Ready:** Battle-tested libraries, not bleeding edge
6. **Open Source:** Prefer OSS to reduce vendor lock-in
7. **Scalability:** Can scale from 100 to 100,000 users

### Dependency Philosophy

- **Minimal Dependencies:** Only add when necessary
- **Trust & Maintenance:** Prefer well-maintained, popular libraries
- **Security:** Regular `pnpm audit` checks
- **License Compliance:** All dependencies MIT or similar permissive licenses

### Future Additions

Planned technology additions for later phases:
- **Redis:** Session caching, rate limiting
- **Docker:** Production containerization
- **GitHub Actions:** CI/CD pipelines
- **CodeMirror/Monaco:** Advanced code editor
- **WebSockets:** Real-time collaboration
- **Cloudflare Workers:** Edge functions for code execution

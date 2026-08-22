# Monorepo Structure

**Last Updated:** 2026-08-18

## Overview

The Leetcode-App uses a pnpm workspace-based monorepo to share code between the Next.js web app and reusable packages. This structure promotes code reuse, type safety, and atomic changes.

## Repository Structure

```
Leetcode-App/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # Next.js App Router pages
│       │   ├── components/     # React components
│       │   ├── lib/            # Business logic, utilities
│       │   └── __tests__/      # Integration tests
│       ├── public/             # Static assets
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       └── vitest.config.ts
│
├── packages/
│   ├── database/               # Database layer (PostgreSQL)
│   │   ├── src/
│   │   │   ├── client.ts       # Database client
│   │   │   ├── repositories/   # Repository implementations
│   │   │   ├── migrations/     # Database migrations
│   │   │   └── __tests__/      # Integration tests
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   └── domain/                 # Domain logic and types
│       ├── src/
│       │   ├── types/          # TypeScript interfaces
│       │   ├── repositories/   # Repository contracts
│       │   └── lib/            # Business logic (FSM, etc.)
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
│
├── docs/                       # Public documentation
│   ├── ARCHITECTURE.md
│   ├── IMPLEMENTATION_ROADMAP.md
│   └── ...
│
├── documentation/              # Internal documentation (gitignored)
│   ├── README.md
│   ├── SYSTEM_DESIGN.md
│   ├── TECH_STACK.md
│   └── ...
│
├── .github/                    # GitHub configuration
│   └── workflows/              # CI/CD workflows
│
├── pnpm-workspace.yaml         # Workspace configuration
├── package.json                # Root package.json (scripts)
├── tsconfig.json               # Root TypeScript config
├── .gitignore
├── .env.example
└── README.md
```

---

## Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Explanation:**
- Defines which directories are workspaces
- Each workspace has its own `package.json`
- Dependencies are hoisted to root `node_modules` when possible

### Root package.json

```json
{
  "name": "leetcode-app-monorepo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @leetcode-app/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r clean && rm -rf node_modules"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

**Key Scripts:**
- `pnpm -r <script>` - Run script recursively in all workspaces
- `pnpm --filter <workspace> <script>` - Run script in specific workspace

---

## Packages

### 1. domain (Core Domain Logic)

**Location:** `packages/domain/`

**Purpose:**
- Define TypeScript interfaces and types
- Repository contracts (interfaces)
- Business logic (state machines, algorithms)
- **No external dependencies** (pure TypeScript)

**Exports:**
```typescript
// Types
export type { User, PracticeSession, ContentItem } from './types';

// Repository contracts
export type { UserRepository, PracticeSessionRepository } from './repositories';

// Business logic
export { advanceStage, canAdvanceStage } from './lib/practice-session';
export { evaluateCode } from './lib/evaluator';
```

**package.json:**
```json
{
  "name": "@leetcode-app/domain",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "tsup": "^8.3.5",
    "vitest": "^2.1.8"
  }
}
```

**Why Separate Domain Package?**
- ✅ Clear separation of concerns
- ✅ Reusable across applications (web, mobile, CLI)
- ✅ Easy to test (no DB or API dependencies)
- ✅ Type-safe contracts between layers

---

### 2. database (Data Access Layer)

**Location:** `packages/database/`

**Purpose:**
- PostgreSQL client configuration
- Repository implementations (CRUD operations)
- Database migrations
- Integration tests

**Exports:**
```typescript
// Client
export { createDatabaseClient, DatabaseClient } from './client';

// Repositories
export { PostgresUserRepository } from './repositories/user.repository';
export { PostgresPracticeSessionRepository } from './repositories/practice-session.repository';

// Migrations
export { runMigrations } from './migrations';
```

**package.json:**
```json
{
  "name": "@leetcode-app/database",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "migrate:create": "node-pg-migrate create",
    "seed": "tsx src/seed.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@leetcode-app/domain": "workspace:*",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.17.1",
    "@types/pg": "^8.11.10",
    "node-pg-migrate": "^7.8.2",
    "tsup": "^8.3.5",
    "vitest": "^2.1.8"
  }
}
```

**Why Separate Database Package?**
- ✅ Isolates database logic from web app
- ✅ Can be tested independently with Testcontainers
- ✅ Easier to swap implementations (e.g., PostgreSQL → MongoDB)
- ✅ Reusable in serverless functions, CLIs, etc.

---

### 3. web (Next.js Application)

**Location:** `apps/web/`

**Purpose:**
- Frontend UI (React components)
- API routes (Next.js)
- Authentication (NextAuth.js)
- Business logic orchestration

**Dependencies:**
```json
{
  "dependencies": {
    "@leetcode-app/database": "workspace:*",
    "@leetcode-app/domain": "workspace:*",
    "next": "^16.2.11",
    "react": "^19.2.4",
    "next-auth": "^5.0.0-beta.25"
  }
}
```

**Import Pattern:**
```typescript
// In apps/web/src/app/api/practice/route.ts
import { PracticeSession } from '@leetcode-app/domain';
import { PostgresPracticeSessionRepository } from '@leetcode-app/database';

const repo = new PostgresPracticeSessionRepository(db);
const session: PracticeSession = await repo.findById(id);
```

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────┐
│                   apps/web                          │
│  (Next.js, React, NextAuth, API Routes)             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ├──────────► packages/domain
                   │             (Types, Contracts)
                   │
                   └──────────► packages/database
                                 (Repositories)
                                      │
                                      └──────► packages/domain
```

**Rules:**
- ✅ `apps/web` can import from `packages/domain` and `packages/database`
- ✅ `packages/database` can import from `packages/domain`
- ❌ `packages/domain` **cannot** import from `packages/database` or `apps/web`
- ❌ `packages/database` **cannot** import from `apps/web`

**Why These Rules?**
- Prevents circular dependencies
- Keeps domain logic pure and reusable
- Clear hierarchy: `domain` ← `database` ← `web`

---

## Workspace Protocol

### Using Workspace Dependencies

**In package.json:**
```json
{
  "dependencies": {
    "@leetcode-app/domain": "workspace:*",
    "@leetcode-app/database": "workspace:*"
  }
}
```

**What `workspace:*` means:**
- Link to local workspace package (not npm registry)
- Always uses latest local version
- Changes reflect immediately (no reinstall needed)

### Installing Dependencies

```bash
# Install in specific workspace
pnpm add react --filter @leetcode-app/web

# Install in all workspaces
pnpm add -D vitest -w

# Install workspace dependency
pnpm add @leetcode-app/domain --filter @leetcode-app/database
```

---

## Building the Monorepo

### Build Order

1. **packages/domain** (no dependencies)
2. **packages/database** (depends on domain)
3. **apps/web** (depends on domain and database)

**Automatic build order:**
```bash
pnpm -r build
```

pnpm automatically detects dependencies and builds in correct order.

### Build Configuration

**packages/domain/tsup.config.ts:**
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,           // Generate .d.ts files
  splitting: false,
  sourcemap: true,
  clean: true,
});
```

**Output:**
```
packages/domain/dist/
├── index.js        # Compiled JavaScript
└── index.d.ts      # TypeScript declarations
```

---

## Path Aliases

### Root tsconfig.json

```json
{
  "compilerOptions": {
    "paths": {
      "@leetcode-app/*": ["./packages/*/src"]
    }
  }
}
```

### Web App tsconfig.json

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@leetcode-app/database": ["../../packages/database/src"],
      "@leetcode-app/domain": ["../../packages/domain/src"]
    }
  }
}
```

**Usage:**
```typescript
// Instead of:
import { User } from '../../packages/domain/src/types/user';

// Use:
import { User } from '@leetcode-app/domain';
```

---

## Testing in Monorepo

### Unit Tests (domain)

```bash
cd packages/domain
pnpm test
```

- Fast (no external dependencies)
- Pure function testing

### Integration Tests (database)

```bash
cd packages/database
pnpm test
```

- Uses Testcontainers
- Spins up real PostgreSQL

### E2E Tests (web)

```bash
cd apps/web
pnpm test:e2e
```

- Full application testing
- Browser automation (Playwright)

### Run All Tests

```bash
# From root
pnpm -r test
```

---

## Scripts

### Root Scripts (package.json)

```json
{
  "scripts": {
    "dev": "pnpm --filter @leetcode-app/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "clean": "pnpm -r clean && rm -rf node_modules",
    "migrate:up": "pnpm --filter @leetcode-app/database migrate:up",
    "migrate:down": "pnpm --filter @leetcode-app/database migrate:down",
    "migrate:create": "pnpm --filter @leetcode-app/database migrate:create"
  }
}
```

**Explanation:**
- `pnpm -r` - Recursive (run in all workspaces)
- `pnpm --filter <name>` - Run in specific workspace
- Scripts are inherited from workspace `package.json`

---

## Advantages of This Structure

### ✅ Code Reuse
- Types shared between frontend and backend
- Repositories can be used in API routes, scripts, or even mobile apps

### ✅ Type Safety
- Single source of truth for types (`packages/domain`)
- Compile-time errors if API and frontend disagree on types

### ✅ Atomic Changes
- Change interface in one PR, update all implementations
- No version mismatches between packages

### ✅ Easier Testing
- Test business logic (`domain`) without database
- Test data access (`database`) without web app
- Full integration tests in `web`

### ✅ Clear Boundaries
- Domain logic separate from infrastructure
- Database layer separate from UI
- Easy to identify where code belongs

---

## Disadvantages & Tradeoffs

### ❌ Build Complexity
- Must build packages before using in apps
- Requires understanding of dependency graph

**Mitigation:** pnpm handles build order automatically

### ❌ Tooling Setup
- More complex than single-package project
- Need to configure path aliases, tsconfig references

**Mitigation:** Well-documented setup process

### ❌ Workspace Protocol Limitations
- Can't version packages independently
- All packages always use latest local version

**Mitigation:** Not a concern for monolithic deployment

---

## Migration from Single Package

If you started with a single package and want to split:

### Before:
```
apps/web/
├── src/
│   ├── types/
│   ├── repositories/
│   └── app/
```

### After:
```
packages/domain/src/types/
packages/database/src/repositories/
apps/web/src/app/
```

### Steps:
1. Create `packages/domain` and `packages/database`
2. Move files to new locations
3. Update imports to use `@leetcode-app/*`
4. Add workspace dependencies in `package.json`
5. Build packages: `pnpm -r build`
6. Verify tests pass: `pnpm -r test`

---

## Future Expansion

### Potential New Packages

**packages/ui**
- Shared React components
- Design system
- Used by web app and future mobile app

**packages/api-client**
- Type-safe API client
- Fetch wrappers
- Used by web frontend to call backend APIs

**apps/mobile**
- React Native mobile app
- Reuses `domain`, `database`, `ui`, `api-client`

**packages/email**
- Email templates
- Transactional email service
- Used by web app for notifications

---

## Resources

- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Turborepo (Advanced Monorepo Tool)](https://turbo.build/repo)
- [Monorepo Best Practices](https://monorepo.tools/)

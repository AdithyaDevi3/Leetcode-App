# Development Workflow

**Last Updated:** 2026-08-18

## Overview

This guide covers how to develop, debug, test, and deploy the Leetcode-App. Follow these workflows for a smooth development experience.

## Getting Started

### Prerequisites

- **Node.js:** 20.x or higher
- **pnpm:** 9.x or higher
- **Docker:** For PostgreSQL and integration tests
- **Git:** Version control
- **VS Code:** Recommended IDE (or your preferred editor)

### Initial Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd Leetcode-App

# 2. Install dependencies
pnpm install

# 3. Copy environment variables
cp .env.example .env.local

# 4. Edit .env.local with your credentials
# - Generate AUTH_SECRET: openssl rand -base64 32
# - Get OAuth credentials from Google/GitHub
# - Set PostgreSQL credentials

# 5. Start PostgreSQL (Docker)
docker run -d \
  --name leetcode-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=leetcode_app \
  -p 5432:5432 \
  postgres:15-alpine

# 6. Run database migrations
cd packages/database
pnpm migrate:up
cd ../..

# 7. (Optional) Seed database
cd packages/database
pnpm seed
cd ../..

# 8. Start development server
cd apps/web
pnpm dev
```

**Visit:** http://localhost:3000

---

## Development Commands

### Workspace (Root)

```bash
# Install all dependencies
pnpm install

# Run tests for all packages
pnpm test

# Build all packages
pnpm build

# Lint all code
pnpm lint

# Type check all TypeScript
pnpm typecheck
```

### Web App (`apps/web`)

```bash
cd apps/web

# Development server (hot reload)
pnpm dev                  # http://localhost:3000

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Lint
pnpm lint

# Type check
pnpm typecheck
```

### Database Package (`packages/database`)

```bash
cd packages/database

# Run migrations (up)
pnpm migrate:up

# Rollback last migration
pnpm migrate:down

# Create new migration
pnpm migrate:create <migration-name>

# Seed database
pnpm seed

# Run integration tests
pnpm test

# Build package
pnpm build
```

### Domain Package (`packages/domain`)

```bash
cd packages/domain

# Run unit tests
pnpm test

# Build package
pnpm build
```

---

## Git Workflow

### Branching Strategy

**Main Branches:**
- `main` - Production-ready code
- `develop` - Integration branch for features

**Feature Branches:**
- `feature/user-authentication`
- `feature/code-editor-integration`
- `fix/session-expiry-bug`

**Naming Convention:**
- `feature/<description>` - New features
- `fix/<description>` - Bug fixes
- `refactor/<description>` - Code refactoring
- `docs/<description>` - Documentation updates
- `test/<description>` - Test additions

### Workflow

```bash
# 1. Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/my-new-feature

# 2. Make changes and commit
git add .
git commit -m "feat: implement user authentication"

# 3. Push to remote
git push origin feature/my-new-feature

# 4. Create Pull Request on GitHub
# - PR title: "feat: implement user authentication"
# - Description: Explain changes, link issues
# - Request review from team

# 5. Address review feedback
git add .
git commit -m "refactor: address review feedback"
git push origin feature/my-new-feature

# 6. Merge PR (squash or rebase)
# 7. Delete feature branch
git branch -d feature/my-new-feature
```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `refactor` - Code refactoring
- `docs` - Documentation updates
- `test` - Test additions/updates
- `chore` - Build/tooling changes
- `perf` - Performance improvements
- `style` - Code style changes (formatting)

**Examples:**
```
feat(auth): implement Google OAuth login

Add Google OAuth integration using NextAuth.js.
Includes session management and user creation.

Closes #42
```

```
fix(api): prevent race condition in session merge

Use database transaction to ensure atomic guest-to-user upgrade.

Fixes #58
```

---

## Database Workflow

### Creating Migrations

```bash
cd packages/database

# 1. Create migration file
pnpm migrate:create add-user-preferences

# 2. Edit migration file
# File created: migrations/1734528003000_add-user-preferences.ts
```

**Migration Template:**
```typescript
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('users', {
    preferences: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('users', 'preferences');
}
```

**Apply Migration:**
```bash
pnpm migrate:up
```

**Rollback (if needed):**
```bash
pnpm migrate:down
```

### Seeding Data

**Edit:** `packages/database/src/seed.ts`

```typescript
export async function seed() {
  const db = createDatabaseClient();
  
  // Insert content items
  await db.query(`
    INSERT INTO content_items (id, title, difficulty, problem_description, test_cases)
    VALUES ($1, $2, $3, $4, $5)
  `, ['two-sum', 'Two Sum', 'easy', 'Given an array...', JSON.stringify([...])]);
  
  // Insert tags
  await db.query(`
    INSERT INTO tags (id, name, category)
    VALUES ($1, $2, $3)
  `, ['hash-map', 'Hash Map', 'data-structure']);
  
  await db.close();
}
```

**Run Seed:**
```bash
cd packages/database
pnpm seed
```

---

## Testing Workflow

### Unit Tests

**Location:** `*.test.ts` files alongside source

```bash
# Run all unit tests
pnpm test

# Run specific test file
pnpm test src/lib/practice-session.test.ts

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

**Writing Tests:**
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './my-function';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
  
  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow('Invalid input');
  });
});
```

### Integration Tests

**Location:** `__tests__/*.integration.test.ts`

**Requires:** Docker (for Testcontainers)

```bash
cd packages/database
pnpm test

# Integration tests automatically:
# 1. Start PostgreSQL container
# 2. Run migrations
# 3. Execute tests
# 4. Stop container
```

**Writing Integration Tests:**
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

describe('UserRepository (Integration)', () => {
  let container: StartedPostgreSqlContainer;
  let db: DatabaseClient;
  
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine').start();
    db = createDatabaseClient({ /* container config */ });
    await runMigrations(db);
  }, 60000);
  
  afterAll(async () => {
    await db.close();
    await container.stop();
  });
  
  beforeEach(async () => {
    await db.query('TRUNCATE users CASCADE');
  });
  
  it('should create user', async () => {
    const user = await userRepo.create({ email: 'test@example.com' });
    expect(user.id).toBeDefined();
  });
});
```

### End-to-End Tests (Future)

```bash
# Install Playwright
pnpm add -D @playwright/test

# Run E2E tests
pnpm test:e2e

# Run in UI mode (debug)
pnpm playwright test --ui
```

---

## Debugging

### VS Code Configuration

**`.vscode/launch.json`:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev",
      "cwd": "${workspaceFolder}/apps/web",
      "serverReadyAction": {
        "pattern": "ready on",
        "uriFormat": "http://localhost:3000",
        "action": "openExternally"
      }
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}/apps/web"
    },
    {
      "name": "Debug Vitest Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test", "--run", "--threads", "false"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Console Debugging

```typescript
// Server-side (logs to terminal)
console.log('Debug:', { userId, sessionId });

// Client-side (logs to browser console)
console.log('Client Debug:', state);

// Better: Use structured logging
import { logger } from '@/lib/logger';
logger.info('User logged in', { userId, timestamp: Date.now() });
```

### Database Debugging

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres -d leetcode_app

# Check tables
\dt

# Query data
SELECT * FROM users;
SELECT * FROM practice_sessions WHERE user_id = 'some-uuid';

# Check indexes
\di

# Exit
\q
```

### Enable SQL Query Logging

**Edit:** `packages/database/src/client.ts`

```typescript
const client = new Pool({
  // ... config
});

// Log all queries
client.on('query', (query) => {
  console.log('[SQL]', query.text, query.values);
});
```

---

## Code Quality

### Linting

```bash
# Run ESLint
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

**Configuration:** `eslint.config.mjs`

### Type Checking

```bash
# Run TypeScript compiler (no emit)
pnpm typecheck
```

**Configuration:** `tsconfig.json`

### Pre-Commit Hooks (Optional)

**Install Husky:**
```bash
pnpm add -D husky lint-staged
npx husky install
```

**`.husky/pre-commit`:**
```bash
#!/bin/sh
pnpm lint-staged
```

**`package.json`:**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

---

## Environment Variables

### Required Variables

**`.env.local`:**
```bash
# NextAuth
AUTH_SECRET=<openssl-rand-base64-32>
NEXTAUTH_URL=http://localhost:3000

# OAuth Providers
AUTH_GOOGLE_ID=<google-client-id>
AUTH_GOOGLE_SECRET=<google-client-secret>
AUTH_GITHUB_ID=<github-client-id>
AUTH_GITHUB_SECRET=<github-client-secret>

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=leetcode_app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<password>

# Optional
NODE_ENV=development
LOG_LEVEL=info
```

### Getting OAuth Credentials

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project (or select existing)
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: Web application
6. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Client Secret

#### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Application name: Leetcode-App (Dev)
4. Homepage URL: `http://localhost:3000`
5. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
6. Copy Client ID and Client Secret

---

## Deployment

### Vercel (Recommended)

**1. Install Vercel CLI:**
```bash
pnpm add -g vercel
```

**2. Login:**
```bash
vercel login
```

**3. Link Project:**
```bash
vercel link
```

**4. Set Environment Variables:**
```bash
vercel env add AUTH_SECRET
vercel env add AUTH_GOOGLE_ID
vercel env add AUTH_GOOGLE_SECRET
# ... (add all variables)
```

**5. Deploy:**
```bash
vercel --prod
```

**Auto-Deploy:**
- Connect GitHub repository to Vercel
- Every push to `main` auto-deploys

### Database (Production)

**Option 1: Railway**
1. Create Railway project
2. Add PostgreSQL service
3. Copy connection string to `POSTGRES_URL` env var
4. Run migrations: `pnpm migrate:up`

**Option 2: Supabase**
1. Create Supabase project
2. Copy connection string
3. Run migrations

---

## Troubleshooting

### Issue: Port 3000 Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Issue: Database Connection Refused

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Start PostgreSQL
docker start leetcode-postgres

# Check logs
docker logs leetcode-postgres
```

### Issue: Migration Failed

```bash
# Rollback migration
cd packages/database
pnpm migrate:down

# Fix migration file
# Re-apply migration
pnpm migrate:up
```

### Issue: Tests Failing

```bash
# Check if Docker is running (for integration tests)
docker ps

# Clean install dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Clear Vitest cache
pnpm test --clearCache
```

### Issue: OAuth Not Working

- Check OAuth credentials in `.env.local`
- Verify redirect URIs match exactly
- Ensure `NEXTAUTH_URL` is correct
- Check browser console for errors

---

## Best Practices

### Code Style
- ✅ Use TypeScript for type safety
- ✅ Write descriptive variable names
- ✅ Keep functions small (< 50 lines)
- ✅ Comment complex logic
- ✅ Use async/await over promises

### Testing
- ✅ Write tests for all business logic
- ✅ Test error cases, not just happy paths
- ✅ Use integration tests for repositories
- ✅ Mock external services
- ✅ Keep tests isolated (no shared state)

### Git
- ✅ Commit often, push frequently
- ✅ Write meaningful commit messages
- ✅ Create small, focused PRs
- ✅ Request code reviews
- ✅ Don't commit secrets

### Performance
- ✅ Use indexes on foreign keys
- ✅ Limit database queries in loops
- ✅ Use connection pooling
- ✅ Cache frequently accessed data
- ✅ Optimize images (Next.js Image component)

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [Testcontainers Documentation](https://node.testcontainers.org/)

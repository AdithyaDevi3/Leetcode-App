# Testing Strategy

**Last Updated:** 2026-08-18

## Overview

The testing strategy emphasizes confidence, developer experience, and realistic test environments. We use a layered approach: unit tests for business logic, integration tests for data access, and security tests for authentication flows.

## Testing Pyramid

```
         ╱╲
        ╱E2E╲           🎯 End-to-End Tests (Phase 1.6)
       ╱────╲            - Critical user workflows
      ╱──────╲           - Browser automation
     ╱Security╲          - Multi-page flows
    ╱──────────╲
   ╱Integration╲        🔧 Integration Tests (Phase 1.2+)
  ╱──────────────╲       - Repositories with real DB
 ╱─────Unit───────╲      - API routes
╱──────────────────╲     - Auth flows

                         ⚡ Unit Tests (All Phases)
                          - Business logic
                          - Pure functions
                          - State machines
```

## Test Tooling

### Vitest
**Framework:** Vitest 4.1.10 (web), 2.1.8 (database)

**Why Vitest?**
- ⚡ **Fast:** Parallel execution, smart caching
- 🎯 **Jest-Compatible:** Familiar API (describe, it, expect)
- 📦 **ESM Native:** No CommonJS transpilation needed
- 🔧 **TypeScript First:** No extra setup
- 🎨 **Great DX:** Beautiful error messages, watch mode

**Configuration (`vitest.config.ts`):**
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,  // 60 seconds (testcontainers startup)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@leetcode-app/database': path.resolve(__dirname, '../../packages/database/src'),
      '@leetcode-app/domain': path.resolve(__dirname, '../../packages/domain/src'),
    },
  },
});
```

### Testcontainers
**Framework:** Testcontainers 10.17.1

**Why Testcontainers?**
- 🐳 **Real Database:** Test against actual PostgreSQL
- 🔒 **Isolated:** Each test suite gets fresh database
- 🧹 **Auto-Cleanup:** Containers destroyed after tests
- 🎯 **Confidence:** Catches real SQL errors, constraint violations

**Setup Pattern:**
```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;
let db: DatabaseClient;

beforeAll(async () => {
  // Start PostgreSQL 15 container
  container = await new PostgreSqlContainer('postgres:15-alpine')
    .withExposedPorts(5432)
    .start();
  
  // Create database client
  db = createDatabaseClient({
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  });
  
  // Run migrations
  await runMigrations(db);
}, 60000);

afterAll(async () => {
  await db.close();
  await container.stop();
});
```

## Test Categories

### 1. Unit Tests

**Location:** `*.test.ts` alongside source files  
**Purpose:** Test business logic in isolation  
**No External Dependencies:** No database, no file system, no network

#### Example: Practice Session State Machine

**File:** `/packages/domain/src/lib/practice-session.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { PracticeSession, advanceStage } from './practice-session';

describe('PracticeSession', () => {
  describe('advanceStage', () => {
    it('should advance from understand to match', () => {
      const session: PracticeSession = {
        id: 'test-id',
        currentStage: 'understand',
        status: 'in_progress',
        // ... other fields
      };
      
      const result = advanceStage(session, 'match');
      
      expect(result.currentStage).toBe('match');
      expect(result.revision).toBe(session.revision + 1);
    });
    
    it('should throw if trying to skip stages', () => {
      const session: PracticeSession = {
        id: 'test-id',
        currentStage: 'understand',
        // ...
      };
      
      expect(() => advanceStage(session, 'plan')).toThrow('Cannot skip stages');
    });
    
    it('should throw if trying to regress', () => {
      const session: PracticeSession = {
        id: 'test-id',
        currentStage: 'plan',
        // ...
      };
      
      expect(() => advanceStage(session, 'match')).toThrow('Cannot go back');
    });
  });
});
```

#### Example: Code Evaluator

**File:** `/apps/web/src/lib/evaluator.test.ts`

```typescript
describe('CodeEvaluator', () => {
  it('should evaluate correct solution', () => {
    const code = `
      function twoSum(nums, target) {
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
          const complement = target - nums[i];
          if (map.has(complement)) {
            return [map.get(complement), i];
          }
          map.set(nums[i], i);
        }
        return null;
      }
    `;
    
    const result = evaluateCode(code, twoSumTestCases);
    
    expect(result.passed).toBe(true);
    expect(result.testResults).toHaveLength(twoSumTestCases.length);
    expect(result.testResults.every(r => r.passed)).toBe(true);
  });
  
  it('should detect incorrect solutions', () => {
    const code = `
      function twoSum(nums, target) {
        return [0, 1];  // Wrong!
      }
    `;
    
    const result = evaluateCode(code, twoSumTestCases);
    
    expect(result.passed).toBe(false);
    expect(result.testResults.some(r => !r.passed)).toBe(true);
  });
});
```

### 2. Integration Tests

**Location:** `**/__tests__/*.integration.test.ts`  
**Purpose:** Test data access layer with real database  
**Uses:** Testcontainers + PostgreSQL

#### Example: User Repository

**File:** `/packages/database/src/repositories/__tests__/user.repository.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DatabaseClient, createDatabaseClient } from '../../client';
import { PostgresUserRepository } from '../user.repository';
import { runMigrations } from '../../migrations';

describe('PostgresUserRepository (Integration)', () => {
  let container: StartedPostgreSqlContainer;
  let db: DatabaseClient;
  let userRepo: PostgresUserRepository;
  
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15-alpine').start();
    db = createDatabaseClient({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });
    await runMigrations(db);
    userRepo = new PostgresUserRepository(db);
  }, 60000);
  
  afterAll(async () => {
    await db.close();
    await container.stop();
  });
  
  beforeEach(async () => {
    // Clean database before each test
    await db.query('TRUNCATE users CASCADE');
  });
  
  describe('create', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'learner' as const,
        preferences: {},
      };
      
      const user = await userRepo.create(userData);
      
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.displayName).toBe(userData.displayName);
      expect(user.revision).toBe(1);
    });
    
    it('should throw on duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'learner' as const,
        preferences: {},
      };
      
      await userRepo.create(userData);
      
      await expect(userRepo.create(userData)).rejects.toThrow('unique constraint');
    });
  });
  
  describe('update with optimistic concurrency', () => {
    it('should update user when revision matches', async () => {
      const user = await userRepo.create({
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'learner',
        preferences: {},
      });
      
      const updated = await userRepo.update(user.id, user.revision, {
        displayName: 'Updated Name',
      });
      
      expect(updated.displayName).toBe('Updated Name');
      expect(updated.revision).toBe(user.revision + 1);
    });
    
    it('should throw when revision is stale', async () => {
      const user = await userRepo.create({
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'learner',
        preferences: {},
      });
      
      // Update with correct revision
      await userRepo.update(user.id, user.revision, {
        displayName: 'First Update',
      });
      
      // Try to update with stale revision
      await expect(
        userRepo.update(user.id, user.revision, {
          displayName: 'Stale Update',
        })
      ).rejects.toThrow('Revision mismatch');
    });
  });
});
```

### 3. Security Tests

**Location:** `/apps/web/src/lib/auth/__tests__/auth.security.test.ts`  
**Purpose:** Validate authentication security requirements  
**Coverage:** CSRF, session fixation, ownership, logout, revocation, guest merge

#### Test Coverage

**1. CSRF Protection**
```typescript
describe('CSRF Protection', () => {
  it('should set secure cookie attributes', async () => {
    const session = await createSession(userId);
    
    expect(session.cookie.httpOnly).toBe(true);
    expect(session.cookie.sameSite).toBe('lax');
    expect(session.cookie.secure).toBe(true);  // in production
  });
  
  it('should reject requests without CSRF token', async () => {
    const response = await fetch('/api/auth/signout', {
      method: 'POST',
      // No CSRF token
    });
    
    expect(response.status).toBe(403);
  });
});
```

**2. Session Fixation Prevention**
```typescript
describe('Session Fixation Prevention', () => {
  it('should generate new token on authentication', async () => {
    const preAuthToken = getSessionToken();
    
    await signIn('google');
    
    const postAuthToken = getSessionToken();
    expect(postAuthToken).not.toBe(preAuthToken);
  });
  
  it('should invalidate old tokens', async () => {
    const oldToken = await createSession(userId);
    
    await signIn('google');
    
    const isValid = await validateSession(oldToken);
    expect(isValid).toBe(false);
  });
});
```

**3. Object Ownership**
```typescript
describe('Object Ownership', () => {
  it('should prevent accessing other users practice sessions', async () => {
    const user1Session = await createPracticeSession(user1Id);
    
    const response = await fetch(`/api/practice/${user1Session.id}`, {
      headers: { Cookie: user2SessionCookie },
    });
    
    expect(response.status).toBe(403);
  });
  
  it('should prevent updating other users data', async () => {
    const user1Session = await createPracticeSession(user1Id);
    
    const response = await fetch(`/api/practice/${user1Session.id}`, {
      method: 'PATCH',
      headers: { Cookie: user2SessionCookie },
      body: JSON.stringify({ currentStage: 'plan' }),
    });
    
    expect(response.status).toBe(403);
  });
});
```

**4. Logout Functionality**
```typescript
describe('Logout Functionality', () => {
  it('should delete session on logout', async () => {
    const sessionToken = await signIn('google');
    
    await signOut();
    
    const sessionExists = await db.query(
      'SELECT * FROM sessions WHERE session_token = $1',
      [sessionToken]
    );
    expect(sessionExists.rows.length).toBe(0);
  });
  
  it('should reject requests after logout', async () => {
    const cookie = await signIn('google');
    await signOut();
    
    const response = await fetch('/api/sessions', {
      headers: { Cookie: cookie },
    });
    
    expect(response.status).toBe(401);
  });
});
```

**5. Revoked Session Handling**
```typescript
describe('Revoked Session Handling', () => {
  it('should allow selective session revocation', async () => {
    const session1 = await signIn('google'); // Device 1
    const session2 = await signIn('google'); // Device 2
    
    await revokeSession(session1.id);
    
    const response1 = await fetch('/api/sessions', {
      headers: { Cookie: session1.cookie },
    });
    expect(response1.status).toBe(401);
    
    const response2 = await fetch('/api/sessions', {
      headers: { Cookie: session2.cookie },
    });
    expect(response2.status).toBe(200);
  });
});
```

**6. Guest Merge Collision Handling**
```typescript
describe('Guest Merge Collision Handling', () => {
  it('should preserve all guest data on upgrade', async () => {
    const guestId = await createGuestIdentity();
    const guestSession1 = await createPracticeSession(guestId, 'two-sum');
    const guestSession2 = await createPracticeSession(guestId, 'reverse-linked-list');
    
    const user = await signIn('google');
    await upgradeGuest(guestId, user.id);
    
    const userSessions = await db.query(
      'SELECT * FROM practice_sessions WHERE user_id = $1',
      [user.id]
    );
    
    expect(userSessions.rows.length).toBe(2);
    expect(userSessions.rows.map(r => r.content_id)).toContain('two-sum');
    expect(userSessions.rows.map(r => r.content_id)).toContain('reverse-linked-list');
  });
  
  it('should handle collision (keep both)', async () => {
    const guestId = await createGuestIdentity();
    const guestSession = await createPracticeSession(guestId, 'two-sum');
    
    const user = await signIn('google');
    const userSession = await createPracticeSession(user.id, 'two-sum');
    
    await upgradeGuest(guestId, user.id);
    
    const allSessions = await db.query(
      'SELECT * FROM practice_sessions WHERE user_id = $1 AND content_id = $2',
      [user.id, 'two-sum']
    );
    
    expect(allSessions.rows.length).toBe(2);  // Both kept!
  });
});
```

### 4. End-to-End Tests (Planned - Phase 1.6)

**Tool:** Playwright  
**Purpose:** Test critical user workflows in real browser  
**Coverage:** Sign-up → practice → upgrade → logout

**Example E2E Test:**
```typescript
import { test, expect } from '@playwright/test';

test('guest can practice and upgrade account', async ({ page }) => {
  // 1. Visit as guest
  await page.goto('http://localhost:3000');
  
  // 2. Start practice
  await page.click('text=Start Practicing');
  await page.click('text=Two Sum');
  
  // 3. Complete understand stage
  await page.click('text=I understand the problem');
  await page.click('text=Next Stage');
  
  // 4. Sign in (upgrade guest)
  await page.click('text=Sign In');
  await page.click('text=Continue with Google');
  // ... OAuth flow ...
  
  // 5. Verify data preserved
  await page.goto('http://localhost:3000/dashboard');
  await expect(page.locator('text=Two Sum')).toBeVisible();
  await expect(page.locator('text=Match Stage')).toBeVisible();
});
```

## Test Commands

### Run All Tests
```bash
pnpm test
```

### Run Tests in Watch Mode
```bash
pnpm test:watch
```

### Run Specific Test File
```bash
pnpm test src/lib/auth/__tests__/auth.security.test.ts
```

### Run Tests with Coverage
```bash
pnpm test:coverage
```

### Run Integration Tests Only
```bash
pnpm test:integration
```

### Run Unit Tests Only
```bash
pnpm test:unit
```

## Coverage Goals

| Layer | Target Coverage | Current Coverage |
|-------|----------------|------------------|
| Unit Tests | >80% | 75% (Phase 1.3) |
| Integration Tests | All Repos | 100% (Phase 1.2) |
| Security Tests | All Requirements | 100% (Phase 1.3) |
| E2E Tests | Critical Paths | 0% (Phase 1.6) |

## Testing Best Practices

### 1. Arrange-Act-Assert Pattern
```typescript
it('should do something', () => {
  // Arrange: Set up test data
  const input = { foo: 'bar' };
  
  // Act: Execute the behavior
  const result = doSomething(input);
  
  // Assert: Verify the outcome
  expect(result.success).toBe(true);
});
```

### 2. Descriptive Test Names
✅ **Good:** `should throw error when revision is stale`  
❌ **Bad:** `test update function`

### 3. Test One Thing Per Test
✅ **Good:** Separate tests for success case and error cases  
❌ **Bad:** One giant test covering all scenarios

### 4. Use beforeEach for Cleanup
```typescript
beforeEach(async () => {
  await db.query('TRUNCATE users CASCADE');
});
```

### 5. Avoid Test Interdependence
- Each test should run in isolation
- Tests should not rely on execution order
- Use testcontainers for fresh database per suite

### 6. Mock External Services
```typescript
// Mock email service
vi.mock('./email-service', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));
```

### 7. Test Error Cases
```typescript
it('should handle database connection failure', async () => {
  const badDb = createDatabaseClient({ host: 'invalid' });
  
  await expect(
    userRepo.findById('test-id')
  ).rejects.toThrow('Connection refused');
});
```

## CI/CD Integration (Planned)

### GitHub Actions Workflow
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm test:ci
      - run: pnpm test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### VS Code Launch Configuration
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test", "--run", "--threads", "false"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Print SQL Queries
```typescript
beforeAll(() => {
  process.env.LOG_QUERIES = 'true';
});
```

### Inspect Database State
```typescript
afterEach(async () => {
  const users = await db.query('SELECT * FROM users');
  console.log('Current users:', users.rows);
});
```

## Future Testing Enhancements

### Phase 1.6
- ✅ Playwright E2E tests
- ✅ Visual regression testing
- ✅ Performance benchmarks

### Phase 2
- ✅ Load testing (k6, Artillery)
- ✅ Chaos engineering (simulate failures)
- ✅ Mutation testing (Stryker)

### Phase 3
- ✅ A/B testing framework
- ✅ Synthetic monitoring
- ✅ Contract testing (Pact)

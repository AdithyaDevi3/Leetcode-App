# Database Schema

**Last Updated:** 2026-08-18

## Overview

The database uses PostgreSQL 15 with a normalized relational schema. The design prioritizes data integrity, supports optimistic concurrency control, and uses JSONB for flexible fields.

## Schema Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                      Authentication                              │
│                                                                  │
│  ┌──────────┐     ┌───────────┐     ┌────────────────────┐    │
│  │  users   │◄────│ accounts  │     │ verification_tokens │    │
│  └──────────┘     └───────────┘     └────────────────────┘    │
│       │                                                         │
│       └──────► ┌───────────┐                                   │
│                │ sessions  │                                    │
│                └───────────┘                                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        Core Domain                               │
│                                                                  │
│  ┌──────────┐                    ┌─────────────────┐           │
│  │  users   │                    │ content_items   │           │
│  └──────────┘                    └─────────────────┘           │
│       │                                   │                     │
│       │   ┌──────────────────┐           │                     │
│       └───┤ practice_sessions├───────────┘                     │
│           └──────────────────┘                                  │
│                    │                                            │
│       ┌────────────┼────────────┐                              │
│       │            │             │                              │
│  ┌─────────┐  ┌───────────┐ ┌───────────────────────┐         │
│  │ attempts│  │evaluations│ │pseudocode_revisions   │         │
│  └─────────┘  └───────────┘ └───────────────────────┘         │
│                                                                  │
│  ┌──────────────────┐    ┌────────┐   ┌────────────────┐      │
│  │ user_bookmarks   │    │  tags  │   │ content_tags   │      │
│  └──────────────────┘    └────────┘   └────────────────┘      │
│                                                                  │
│  ┌──────────────────┐                                           │
│  │  user_progress   │                                           │
│  └──────────────────┘                                           │
│                                                                  │
│  ┌───────────────────┐                                          │
│  │ guest_identities  │                                          │
│  └───────────────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Tables

### 1. Users

**Purpose:** Authenticated user accounts

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'learner',
  preferences JSONB NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

**Columns:**
- `id` - UUID primary key (auto-generated)
- `email` - Unique email address (from OAuth)
- `email_verified` - When email was verified (from OAuth provider)
- `display_name` - User's display name (from OAuth or custom)
- `role` - User role: `learner`, `instructor`, `admin`
- `preferences` - JSONB for user settings (theme, difficulty level, etc.)
- `revision` - Optimistic concurrency control
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp (auto-updated via trigger)

**Constraints:**
- UNIQUE `email`
- NOT NULL `email`, `role`, `preferences`, `revision`

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `email` (frequent lookups)
- INDEX on `role` (admin queries)

**Sample Data:**
```sql
INSERT INTO users (id, email, display_name, role, preferences)
VALUES 
  ('123e4567-e89b-12d3-a456-426614174000', 'john@example.com', 'John Doe', 'learner', '{"theme": "dark"}'),
  ('223e4567-e89b-12d3-a456-426614174001', 'jane@example.com', 'Jane Smith', 'instructor', '{}');
```

---

### 2. Guest Identities

**Purpose:** Track anonymous users before account creation

```sql
CREATE TABLE guest_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Columns:**
- `id` - UUID primary key (stored in HTTP-only cookie)
- `created_at` - When guest session started

**Usage:**
- Created on first visit (before sign-in)
- Linked to `practice_sessions` via `guest_id`
- Merged into user account on sign-in (data migration)
- Cookie expires after 1 year

---

### 3. Accounts (OAuth)

**Purpose:** Link users to OAuth providers (Google, GitHub)

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  provider VARCHAR(100) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(50),
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_provider ON accounts(provider, provider_account_id);
```

**Columns:**
- `user_id` - Links to `users.id` (CASCADE delete)
- `type` - Account type: `oauth`
- `provider` - OAuth provider: `google`, `github`, etc.
- `provider_account_id` - User's ID at the OAuth provider
- `access_token` - OAuth access token (encrypted at rest)
- `refresh_token` - OAuth refresh token (encrypted at rest)
- `expires_at` - Token expiration timestamp
- `scope` - OAuth scopes granted

**Constraints:**
- UNIQUE `(provider, provider_account_id)` - One account per provider
- FOREIGN KEY `user_id` REFERENCES `users(id)` ON DELETE CASCADE

---

### 4. Sessions

**Purpose:** Active user sessions (database-backed, not JWT)

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires ON sessions(expires);
```

**Columns:**
- `session_token` - Random UUID stored in HTTP-only cookie
- `user_id` - Links to `users.id` (CASCADE delete)
- `expires` - Session expiration (30 days from creation)

**Constraints:**
- UNIQUE `session_token`
- FOREIGN KEY `user_id` REFERENCES `users(id)` ON DELETE CASCADE

**Indexes:**
- PRIMARY KEY on `id`
- INDEX on `session_token` (lookups on every request)
- INDEX on `user_id` (list user's sessions)
- INDEX on `expires` (cleanup expired sessions)

**Automatic Cleanup (Cron Job):**
```sql
DELETE FROM sessions WHERE expires < NOW();
```

---

### 5. Verification Tokens

**Purpose:** Email verification tokens (future feature)

```sql
CREATE TABLE verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier, token)
);

CREATE INDEX idx_verification_tokens ON verification_tokens(identifier, token);
```

**Usage:**
- Email verification (send magic link)
- Password reset (future feature)
- One-time use (deleted after use)

---

### 6. Content Items

**Purpose:** Algorithmic problems (e.g., Two Sum, Reverse Linked List)

```sql
CREATE TABLE content_items (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  difficulty VARCHAR(50) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  problem_description TEXT NOT NULL,
  examples JSONB NOT NULL DEFAULT '[]',
  constraints JSONB NOT NULL DEFAULT '[]',
  hints JSONB NOT NULL DEFAULT '[]',
  solution_template JSONB NOT NULL DEFAULT '{}',
  test_cases JSONB NOT NULL DEFAULT '[]',
  pattern_tags VARCHAR(255)[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_difficulty ON content_items(difficulty);
CREATE INDEX idx_content_pattern_tags ON content_items USING GIN(pattern_tags);
```

**Columns:**
- `id` - Slug (e.g., `two-sum`, `reverse-linked-list`)
- `title` - Display name (e.g., "Two Sum")
- `difficulty` - `easy`, `medium`, `hard`
- `problem_description` - Full problem statement (Markdown)
- `examples` - JSONB array of input/output examples
- `constraints` - JSONB array of problem constraints
- `hints` - JSONB array of hints (revealed progressively)
- `solution_template` - JSONB with language → code template
- `test_cases` - JSONB array of test cases (input, expected output)
- `pattern_tags` - Array of pattern tags (e.g., `hash-map`, `two-pointer`)

**Example:**
```json
{
  "id": "two-sum",
  "title": "Two Sum",
  "difficulty": "easy",
  "problem_description": "Given an array...",
  "examples": [
    {
      "input": {"nums": [2, 7, 11, 15], "target": 9},
      "output": [0, 1],
      "explanation": "nums[0] + nums[1] == 9..."
    }
  ],
  "test_cases": [
    {"input": {"nums": [2, 7, 11, 15], "target": 9}, "expected": [0, 1]},
    {"input": {"nums": [3, 2, 4], "target": 6}, "expected": [1, 2]}
  ]
}
```

---

### 7. Practice Sessions

**Purpose:** Track user's progress through a problem's 5 stages

```sql
CREATE TABLE practice_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guest_identities(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  current_stage VARCHAR(50) NOT NULL CHECK (current_stage IN ('understand', 'match', 'plan', 'implement', 'evaluate')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  session_metadata JSONB NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL))
);

CREATE INDEX idx_practice_sessions_user ON practice_sessions(user_id);
CREATE INDEX idx_practice_sessions_guest ON practice_sessions(guest_id);
CREATE INDEX idx_practice_sessions_content ON practice_sessions(content_id);
CREATE INDEX idx_practice_sessions_status ON practice_sessions(status);
```

**Columns:**
- `user_id` - Authenticated user (nullable, exclusive with `guest_id`)
- `guest_id` - Guest user (nullable, exclusive with `user_id`)
- `content_id` - Problem being practiced
- `current_stage` - `understand`, `match`, `plan`, `implement`, `evaluate`
- `status` - `not_started`, `in_progress`, `completed`
- `started_at` - When user moved from `not_started` to `in_progress`
- `completed_at` - When user finished `evaluate` stage
- `session_metadata` - JSONB for stage-specific data (selected pattern, notes)
- `revision` - Optimistic concurrency control

**Constraints:**
- CHECK: Exactly one of `user_id` or `guest_id` must be set (XOR)
- FOREIGN KEY `user_id` ON DELETE CASCADE
- FOREIGN KEY `guest_id` ON DELETE CASCADE
- FOREIGN KEY `content_id` ON DELETE CASCADE

**Stage Progression:**
```
understand → match → plan → implement → evaluate
   (read)   (pattern) (pseudocode) (code)  (reflect)
```

**State Machine:**
```
not_started → in_progress → completed
     (on first interaction)   (on evaluate stage done)
```

---

### 8. Attempts

**Purpose:** Store code submissions (history of all attempts)

```sql
CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practice_session_id UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  language VARCHAR(50) NOT NULL,
  code TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attempts_session ON attempts(practice_session_id);
CREATE INDEX idx_attempts_created ON attempts(created_at);
```

**Columns:**
- `practice_session_id` - Links to practice session
- `language` - Programming language (`javascript`, `typescript`, `python`)
- `code` - Full code submission
- `passed` - Whether all test cases passed
- `created_at` - Submission timestamp

**Constraints:**
- FOREIGN KEY `practice_session_id` ON DELETE CASCADE

**Usage:**
- Every code submission creates a new attempt
- View history of attempts per session
- Track improvement over time

---

### 9. Evaluations

**Purpose:** Detailed test results for each attempt

```sql
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  test_results JSONB NOT NULL,
  execution_time_ms INTEGER,
  memory_used_kb INTEGER,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluations_attempt ON evaluations(attempt_id);
```

**Columns:**
- `attempt_id` - Links to attempt
- `test_results` - JSONB array of test case results
- `execution_time_ms` - Total execution time
- `memory_used_kb` - Peak memory usage
- `feedback` - Generated feedback (hints, errors)

**Example `test_results`:**
```json
[
  {
    "testCase": 1,
    "input": {"nums": [2, 7, 11, 15], "target": 9},
    "expected": [0, 1],
    "actual": [0, 1],
    "passed": true,
    "executionTime": 12
  },
  {
    "testCase": 2,
    "input": {"nums": [3, 2, 4], "target": 6},
    "expected": [1, 2],
    "actual": [0, 2],
    "passed": false,
    "executionTime": 10
  }
]
```

---

### 10. Pseudocode Revisions

**Purpose:** Track pseudocode iterations during planning stage

```sql
CREATE TABLE pseudocode_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practice_session_id UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(practice_session_id, revision_number)
);

CREATE INDEX idx_pseudocode_session ON pseudocode_revisions(practice_session_id);
```

**Columns:**
- `practice_session_id` - Links to practice session
- `revision_number` - Sequential revision number (1, 2, 3...)
- `content` - Pseudocode text
- `created_at` - When revision was saved

**Constraints:**
- UNIQUE `(practice_session_id, revision_number)`

**Usage:**
- Auto-save pseudocode every 30 seconds
- View history of pseudocode evolution
- Restore previous revisions

---

### 11. Tags

**Purpose:** Categorize problems by algorithmic patterns

```sql
CREATE TABLE tags (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tags_category ON tags(category);
```

**Example Tags:**
```sql
INSERT INTO tags (id, name, category) VALUES
  ('hash-map', 'Hash Map', 'data-structure'),
  ('two-pointer', 'Two Pointer', 'technique'),
  ('sliding-window', 'Sliding Window', 'technique'),
  ('dynamic-programming', 'Dynamic Programming', 'paradigm');
```

---

### 12. Content Tags (Join Table)

**Purpose:** Many-to-many relationship between content and tags

```sql
CREATE TABLE content_tags (
  content_id VARCHAR(255) NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  tag_id VARCHAR(255) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, tag_id)
);

CREATE INDEX idx_content_tags_tag ON content_tags(tag_id);
```

**Usage:**
```sql
-- Find all problems with "hash-map" tag
SELECT c.* 
FROM content_items c
JOIN content_tags ct ON c.id = ct.content_id
WHERE ct.tag_id = 'hash-map';
```

---

### 13. User Bookmarks

**Purpose:** Save favorite problems for quick access

```sql
CREATE TABLE user_bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, content_id)
);

CREATE INDEX idx_user_bookmarks_user ON user_bookmarks(user_id);
```

**Usage:**
```sql
-- Add bookmark
INSERT INTO user_bookmarks (user_id, content_id)
VALUES ('user-uuid', 'two-sum');

-- Get user's bookmarks
SELECT c.* 
FROM content_items c
JOIN user_bookmarks ub ON c.id = ub.content_id
WHERE ub.user_id = 'user-uuid'
ORDER BY ub.created_at DESC;
```

---

### 14. User Progress

**Purpose:** Track completion status per user per problem

```sql
CREATE TABLE user_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  best_attempt_id UUID REFERENCES attempts(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, content_id)
);

CREATE INDEX idx_user_progress_user ON user_progress(user_id);
CREATE INDEX idx_user_progress_status ON user_progress(status);
```

**Columns:**
- `status` - Overall status for this problem
- `best_attempt_id` - Link to best attempt (fastest, cleanest)
- `completed_at` - When first completed

**Usage:**
- Dashboard: Show completed/in-progress problems
- Stats: "You've completed 25/150 problems"
- Recommendation engine: Suggest next problems

---

## Triggers

### Auto-Update `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ... (apply to all tables with updated_at)
```

---

## Migrations

### Migration Tool: node-pg-migrate

**Directory:** `/packages/database/migrations/`

**Files:**
- `1734528000000_initial-schema.ts` - Phase 1.2 (11 tables)
- `1734528002000_add-auth-tables.ts` - Phase 1.3 (3 auth tables)

**Run Migrations:**
```bash
pnpm migrate:up    # Apply migrations
pnpm migrate:down  # Rollback last migration
```

**Create New Migration:**
```bash
pnpm migrate:create add-new-feature
```

---

## Query Patterns

### Find User's Active Practice Sessions
```sql
SELECT 
  ps.*,
  ci.title,
  ci.difficulty,
  COUNT(a.id) AS attempt_count
FROM practice_sessions ps
JOIN content_items ci ON ps.content_id = ci.id
LEFT JOIN attempts a ON ps.id = a.practice_session_id
WHERE ps.user_id = $1
  AND ps.status = 'in_progress'
GROUP BY ps.id, ci.title, ci.difficulty
ORDER BY ps.updated_at DESC;
```

### Get Problem with Test Results
```sql
SELECT 
  c.*,
  ps.current_stage,
  ps.status,
  a.code AS last_attempt_code,
  e.test_results,
  e.passed
FROM content_items c
LEFT JOIN practice_sessions ps ON c.id = ps.content_id AND ps.user_id = $1
LEFT JOIN attempts a ON ps.id = a.practice_session_id
LEFT JOIN evaluations e ON a.id = e.attempt_id
WHERE c.id = $2
ORDER BY a.created_at DESC
LIMIT 1;
```

### User Progress Summary
```sql
SELECT 
  difficulty,
  COUNT(*) AS total,
  COUNT(CASE WHEN up.status = 'completed' THEN 1 END) AS completed,
  COUNT(CASE WHEN up.status = 'in_progress' THEN 1 END) AS in_progress
FROM content_items ci
LEFT JOIN user_progress up ON ci.id = up.content_id AND up.user_id = $1
GROUP BY difficulty;
```

---

## Performance Optimization

### Indexes Created
- All foreign keys indexed
- High-frequency query columns indexed
- GIN index on JSONB pattern_tags (array search)
- Composite indexes for common JOINs

### Connection Pooling
```typescript
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Query Optimization Tips
- Use `EXPLAIN ANALYZE` to identify slow queries
- Avoid `SELECT *` in production code
- Limit result sets (`LIMIT`, `OFFSET` with cursor pagination)
- Use prepared statements for repeated queries

---

## Backup & Recovery

### Automated Backups (Production)
```bash
# Daily backup at 2 AM
0 2 * * * pg_dump -U leetcode_app leetcode_app > /backups/$(date +\%Y\%m\%d).sql
```

### Point-in-Time Recovery
- Enable WAL archiving in PostgreSQL
- Restore to any point in last 30 days

### Manual Backup
```bash
pg_dump -U postgres leetcode_app > backup.sql
```

### Restore from Backup
```bash
psql -U postgres leetcode_app < backup.sql
```

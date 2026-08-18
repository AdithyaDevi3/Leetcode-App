# System Design

**Last Updated:** 2026-08-18

## Overview

The Leetcode-App is a structured learning platform designed to help students master algorithmic problem-solving through a pedagogically-sound staged practice approach.

## Core Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │   UI Layer    │  │  State Mgmt   │  │   API Client     │   │
│  │  (React/TSX)  │  │  (React State)│  │  (fetch/axios)   │   │
│  └───────────────┘  └───────────────┘  └──────────────────┘   │
│                                                                  │
│  Pages:                        Components:                      │
│  - / (home)                    - PracticeWorkspace              │
│  - /practice/[id]              - CodeEditor                     │
│  - /dashboard                  - StageIndicator                 │
│  - /auth/signin                - EvaluationFeedback             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Next.js API Routes)                │
│                                                                  │
│  Authentication:               Practice APIs:                   │
│  - /api/auth/[...nextauth]    - /api/practice/[id]             │
│  - /api/auth/upgrade-guest    - /api/practice/[id]/attempt     │
│  - /api/sessions              - /api/practice/[id]/evaluate    │
│  - /api/sessions/[id]         - /api/content                   │
│                                                                  │
│  Session Layer:               Business Logic:                   │
│  - requireAuth()              - PracticeSession (FSM)           │
│  - getOrCreateGuestSession()  - CodeEvaluator                   │
│  - getCurrentUserId()         - ProgressTracker                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Data Access Layer                           │
│                                                                  │
│  Repository Pattern:                                             │
│  - UserRepository              - ContentRepository              │
│  - PracticeSessionRepository   - ProgressRepository             │
│                                                                  │
│  Features:                                                       │
│  - Optimistic Concurrency Control (revision numbers)            │
│  - Connection Pooling (pg.Pool)                                 │
│  - Transaction Support                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│                                                                  │
│  Schema Design:                                                  │
│  - Normalized relational model                                   │
│  - Foreign key constraints with CASCADE                          │
│  - Indexes on high-query columns                                 │
│  - JSONB for flexible preferences/metadata                       │
│  - Triggers for updated_at timestamps                            │
└─────────────────────────────────────────────────────────────────┘
```

## Design Principles

### 1. **Pedagogical Structure**
The core design is built around a 5-stage learning methodology:
1. **Understand** - Problem comprehension
2. **Match** - Pattern recognition
3. **Plan** - Pseudocode planning
4. **Implement** - Code implementation
5. **Evaluate** - Self-reflection

Each stage is gated, requiring completion before progression.

### 2. **Guest-First Experience**
Users can start practicing immediately without creating an account. Guest sessions are tracked via HTTP-only cookies and can be upgraded to authenticated accounts with deterministic data merging.

### 3. **Optimistic Concurrency Control**
All mutable entities include a `revision` field that increments on each update. This prevents lost updates in concurrent scenarios.

### 4. **Repository Pattern**
Data access is abstracted through repository interfaces, making it easy to:
- Test business logic with mock repositories
- Swap database implementations
- Maintain clear separation of concerns

### 5. **Database-Backed Sessions**
Authentication uses database sessions instead of JWT to support:
- Immediate session revocation
- Session listing across devices
- Better security posture

## Component Architecture

### Frontend Components

#### PracticeWorkspace
The main practice interface that orchestrates:
- Stage progression UI
- Code editor integration
- Pseudocode display
- Evaluation feedback
- Navigation between stages

```typescript
interface PracticeWorkspaceProps {
  sessionId: string;
  contentItem: ContentItem;
  initialSession: PracticeSession;
}
```

Key responsibilities:
- Manage practice session state
- Submit attempts to backend
- Display stage-specific UI
- Handle transitions between stages

### Backend Services

#### PracticeSessionService
Manages the practice session finite state machine (FSM).

States:
- `not_started` → `in_progress` (on first interaction)
- `in_progress` → `completed` (on evaluate stage completion)
- Cannot regress to previous stages

Transitions:
- `advanceStage()` - Move to next stage with validation
- `submitAttempt()` - Record code attempt
- `savePseudocode()` - Save pseudocode revision
- `completeEvaluation()` - Finalize practice session

#### CodeEvaluator
Evaluates code attempts with test case execution.

```typescript
interface EvaluationResult {
  testResults: TestResult[];
  passed: boolean;
  executionTime: number;
  memoryUsed: number;
  feedback: string;
}
```

Uses sandboxed execution environment (planned: Docker containers or isolated Node.js VMs).

### Data Layer

#### Repository Interfaces

**UserRepository**
```typescript
interface UserRepository {
  create(data: CreateUserData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, revision: number, data: Partial<User>): Promise<User>;
  delete(id: string, revision: number): Promise<void>;
  updatePreferences(id: string, preferences: UserPreferences): Promise<User>;
}
```

**PracticeSessionRepository**
```typescript
interface PracticeSessionRepository {
  create(data: CreatePracticeSessionData): Promise<PracticeSession>;
  findById(id: string): Promise<PracticeSession | null>;
  findByUserId(userId: string): Promise<PracticeSession[]>;
  findByGuestId(guestId: string): Promise<PracticeSession[]>;
  update(id: string, revision: number, data: Partial<PracticeSession>): Promise<PracticeSession>;
  advanceStage(id: string, revision: number, newStage: Stage): Promise<PracticeSession>;
}
```

## Data Flow Patterns

### Practice Session Flow

```
1. User starts practice
   ↓
2. Frontend: POST /api/practice/[id]/start
   ↓
3. Backend: Create or resume PracticeSession
   ↓
4. Database: INSERT/SELECT from practice_sessions
   ↓
5. Return session state to frontend
   ↓
6. User interacts (writes code, plans pseudocode)
   ↓
7. Frontend: POST /api/practice/[id]/attempt
   ↓
8. Backend: Save attempt, run evaluation
   ↓
9. Database: INSERT into attempts, evaluations
   ↓
10. Return evaluation results
    ↓
11. Frontend: Display feedback, allow stage progression
    ↓
12. Loop until session completed
```

### Guest-to-User Upgrade Flow

```
1. Guest user signs in with OAuth
   ↓
2. NextAuth creates user account
   ↓
3. Frontend: POST /api/auth/upgrade-guest
   ↓
4. Backend: Start transaction
   ↓
5. Find all guest data (sessions, attempts, pseudocode)
   ↓
6. UPDATE practice_sessions SET user_id = $userId WHERE guest_id = $guestId
   ↓
7. Commit transaction
   ↓
8. Clear guest session cookie
   ↓
9. Return merge stats (sessions merged, attempts preserved)
```

## Scalability Considerations

### Current Scale (Phase 1-2)
- **Users:** < 1,000 concurrent users
- **Database:** Single PostgreSQL instance
- **Compute:** Single Next.js server

### Future Scale (Phase 3+)
- **Users:** 10,000+ concurrent users
- **Database:** Read replicas, connection pooling via PgBouncer
- **Compute:** Horizontal scaling with load balancer
- **Caching:** Redis for session cache, frequently accessed content
- **CDN:** Static assets and cached responses
- **Code Execution:** Separate microservice for sandboxed evaluation

## Technology Choices

### Core Stack
- **Next.js 16.x** - Full-stack React framework with App Router
- **TypeScript 5.x** - Type safety and developer experience
- **PostgreSQL 15** - Reliable relational database
- **NextAuth.js 5.x** - Authentication framework
- **Vitest** - Fast unit testing
- **Testcontainers** - Integration testing with real PostgreSQL

### Rationale
See [TECH_STACK.md](./TECH_STACK.md) for detailed rationale for each technology choice.

## Security Architecture

### Authentication Flow
1. OAuth provider (Google/GitHub) authentication
2. NextAuth callback creates/retrieves user
3. Database session created with random UUID token
4. HTTP-only, SameSite=lax cookie set
5. Session validated on each request via middleware

### Session Security
- **CSRF Protection:** SameSite cookies + CSRF tokens
- **Session Fixation Prevention:** New token on authentication
- **Revocation:** Database-backed sessions allow instant revocation
- **Expiration:** 30-day max age, 24-hour update frequency

### Data Ownership
- All queries validate user_id matches session user
- Foreign key constraints prevent orphaned data
- Cascade deletes for GDPR compliance

See [SECURITY.md](./SECURITY.md) for comprehensive security documentation.

## Performance Optimizations

### Database
- Indexes on high-frequency query columns
- Connection pooling (pg.Pool) for reduced latency
- Prepared statements to prevent SQL injection
- JSONB for flexible schema without joins

### Frontend
- React Server Components for reduced client bundle
- Code splitting for large editor components
- Lazy loading for non-critical UI

### Caching (Planned)
- Static content (problems) cached at CDN
- User sessions cached in Redis
- Frequently accessed data memoized

## Monitoring & Observability (Planned)

- **Application Logs:** Structured JSON logs with correlation IDs
- **Error Tracking:** Sentry integration
- **Performance Monitoring:** Web Vitals, API latency metrics
- **Database Monitoring:** Query performance, connection pool stats
- **User Analytics:** Practice session completion rates, stage drop-offs

## Disaster Recovery

- **Database Backups:** Daily automated backups, 30-day retention
- **Point-in-Time Recovery:** PostgreSQL WAL archiving
- **Secrets Management:** Environment variables, never committed
- **Deployment Rollback:** Git-based deployments allow instant rollback

## Future Architecture Evolution

### Phase 2: Microservices Split
- Separate code execution service (security isolation)
- Dedicated evaluation service (scalability)
- Background job queue (async tasks)

### Phase 3: Global Scale
- Multi-region database replicas
- Edge caching with Cloudflare/Vercel
- WebSockets for real-time collaboration (pair programming mode)
- GraphQL API for flexible client queries

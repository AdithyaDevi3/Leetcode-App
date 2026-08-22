# Design Tradeoffs

**Last Updated:** 2026-08-18

## Overview

This document captures key design decisions, alternatives considered, and the tradeoffs made. Every architectural choice involves compromises—this doc explains the "why" behind our decisions.

---

## Authentication & Sessions

### Decision: Database Sessions vs JWT

**Choice:** Database-backed sessions  
**Tradeoff:** Performance vs Security & Features

#### Pros (Database Sessions)
✅ **Immediate Revocation:** Can invalidate sessions instantly  
✅ **Session Listing:** Users can see all active sessions  
✅ **Multi-Device Management:** Revoke specific device sessions  
✅ **Security:** Better for user-facing apps, prevents token theft  
✅ **Audit Trail:** Track session activity in database  

#### Cons (Database Sessions)
❌ **Database Dependency:** Every request requires DB query  
❌ **Scaling Complexity:** Database becomes bottleneck at scale  
❌ **Latency:** Extra ~5-10ms per request for session lookup  

#### Pros (JWT Alternative)
✅ **Stateless:** No database query on every request  
✅ **Scalability:** Horizontal scaling without shared state  
✅ **CDN/Edge Friendly:** Can verify tokens at edge locations  
✅ **Lower Latency:** No DB roundtrip  

#### Cons (JWT Alternative)
❌ **No Revocation:** Can't invalidate tokens until expiry  
❌ **Token Theft:** If stolen, valid until expiration  
❌ **No Session Management:** Can't list or manage sessions  
❌ **Token Size:** JWTs are larger than session IDs in cookies  

**Why We Chose Database Sessions:**
- User security is paramount for an education platform
- Session revocation is a critical feature (compromised device scenario)
- Multi-device session management improves UX
- Performance impact is acceptable at our scale (< 10k users)
- Can add Redis caching layer later if needed

**When to Reconsider:**
- If scaling beyond 100k concurrent users
- If latency becomes critical (sub-100ms requirements)
- If deploying to edge/serverless with cold starts

---

## Guest Sessions

### Decision: Cookie-Based Guest Tracking

**Choice:** HTTP-only cookie with random UUID  
**Tradeoff:** Simplicity vs Persistence

#### Pros
✅ **Simple Implementation:** Just set a cookie, no backend state  
✅ **Secure:** HTTP-only prevents XSS, SameSite prevents CSRF  
✅ **No Account Required:** Immediate practice experience  
✅ **Deterministic Merge:** Clear upgrade path to full account  

#### Cons
❌ **Cookie Deletion:** Users lose progress if cookies cleared  
❌ **Single Device:** Sessions don't sync across devices  
❌ **Privacy Concerns:** Some users block all cookies  

**Alternatives Considered:**

1. **LocalStorage (Client-Side Only)**
   - ❌ Can't enforce HttpOnly security
   - ❌ Vulnerable to XSS attacks
   - ✅ Survives cookie clearing

2. **Fingerprinting**
   - ❌ Privacy invasive
   - ❌ Unreliable (false positives)
   - ❌ Ethical concerns

3. **Mandatory Login**
   - ❌ Friction in onboarding
   - ❌ Reduces conversion rate
   - ✅ Simpler implementation

**Why We Chose Cookie-Based:**
- Best balance of security and UX
- Most users keep cookies enabled
- Can prompt to create account before data loss
- Guest → User upgrade path is pedagogically sound

---

## Database Design

### Decision: Normalized Relational Schema

**Choice:** Normalized tables with foreign keys  
**Tradeoff:** Data Integrity vs Query Complexity

#### Pros
✅ **Data Integrity:** Foreign key constraints prevent orphans  
✅ **No Redundancy:** Single source of truth for each entity  
✅ **ACID Compliance:** Strong consistency guarantees  
✅ **Flexible Queries:** JOINs allow complex queries  

#### Cons
❌ **Join Overhead:** Complex queries need multiple JOINs  
❌ **Migration Complexity:** Schema changes require migrations  
❌ **N+1 Queries:** Easy to create performance issues  

**Alternatives Considered:**

1. **Denormalized Schema**
   - ✅ Faster reads (no JOINs)
   - ❌ Data duplication, consistency issues
   - ❌ Harder to maintain correctness

2. **Document Database (MongoDB)**
   - ✅ Flexible schema
   - ❌ Weak relational support
   - ❌ Eventual consistency
   - ❌ Learning curve for team

3. **Graph Database (Neo4j)**
   - ✅ Great for relationships
   - ❌ Overkill for our use case
   - ❌ Smaller ecosystem

**Why We Chose Normalized:**
- Data correctness is critical (no lost attempts, accurate progress)
- Relationships are complex (sessions → attempts → evaluations)
- Team familiarity with SQL
- PostgreSQL performance is sufficient with indexes

**Optimizations Applied:**
- JSONB for flexible fields (preferences, metadata)
- Strategic denormalization (current_stage in session row)
- Indexes on high-frequency query columns

---

## Repository Pattern

### Decision: Custom Repository Interfaces vs ORM

**Choice:** Manual repository pattern with raw SQL  
**Tradeoff:** Control vs Boilerplate

#### Pros
✅ **Full SQL Control:** Write optimal queries  
✅ **No ORM Magic:** Explicit, debuggable  
✅ **Performance:** No query builder overhead  
✅ **Flexibility:** Easy to add custom queries  
✅ **Type Safety:** TypeScript interfaces for contracts  

#### Cons
❌ **More Code:** No auto-generated CRUD  
❌ **Manual Mapping:** Convert DB rows to domain types  
❌ **No Migrations from Models:** Schema separate from code  

**Alternatives Considered:**

1. **Prisma ORM**
   - ✅ Auto-generated types
   - ✅ Type-safe query builder
   - ❌ Performance overhead
   - ❌ Less SQL control
   - ❌ Large dependency

2. **TypeORM**
   - ✅ Decorators for models
   - ✅ Active Record pattern
   - ❌ Runtime overhead
   - ❌ Complex configuration

3. **Drizzle ORM**
   - ✅ Lightweight, type-safe
   - ✅ SQL-like API
   - ❌ Less mature
   - ❌ Smaller ecosystem

**Why We Chose Repository Pattern:**
- Full control over SQL for performance-critical queries
- No hidden behavior or N+1 query surprises
- Easier to test with mock repositories
- Team prefers explicit over implicit
- Can optimize queries without fighting ORM

**When to Reconsider:**
- If CRUD boilerplate becomes overwhelming
- If team prefers type-safe query builders
- If Drizzle or Kysely mature significantly

---

## Optimistic Concurrency Control

### Decision: Revision Numbers vs Timestamps

**Choice:** Integer `revision` field on mutable entities  
**Tradeoff:** Simplicity vs Edge Cases

#### Pros
✅ **Simple:** Just increment integer  
✅ **Deterministic:** No clock skew issues  
✅ **Testable:** Predictable behavior  
✅ **Atomic:** Database handles increment  

#### Cons
❌ **Manual Implementation:** Must remember to check revision  
❌ **Not Automatic:** Developer must use correctly  

**Alternatives Considered:**

1. **Timestamps (updated_at)**
   - ❌ Clock skew on distributed systems
   - ❌ Millisecond precision issues
   - ✅ Simpler schema (already have updated_at)

2. **No Concurrency Control**
   - ❌ Lost updates in race conditions
   - ❌ Data corruption risk
   - ✅ Simpler code

3. **Database Row-Level Locking**
   - ✅ Automatic, no manual checks
   - ❌ Deadlock potential
   - ❌ Performance impact

**Why We Chose Revision Numbers:**
- Reliable across distributed systems
- Clear semantic intent (version number)
- No database-specific locking syntax
- Easy to test and reason about
- Explicit (developer aware of concurrency)

---

## Testing Strategy

### Decision: Integration Tests with Testcontainers

**Choice:** Spin up real PostgreSQL in Docker for tests  
**Tradeoff:** Test Reliability vs Speed

#### Pros
✅ **Real Database:** Catches actual SQL/constraint issues  
✅ **Isolated:** Each test suite gets fresh DB  
✅ **Confidence:** No mocking discrepancies  
✅ **Catch Migration Bugs:** Tests run full migration stack  

#### Cons
❌ **Slower:** ~2-3 seconds startup per test suite  
❌ **Docker Dependency:** Requires Docker installed  
❌ **CI Complexity:** Need Docker in CI environment  

**Alternatives Considered:**

1. **Mock Database**
   - ✅ Fast (no I/O)
   - ❌ Doesn't catch real SQL errors
   - ❌ Mocks drift from reality

2. **SQLite In-Memory**
   - ✅ Fast, no Docker
   - ❌ Different SQL dialect than PostgreSQL
   - ❌ Missing PostgreSQL features (JSONB, etc.)

3. **Shared Test Database**
   - ✅ Faster than spinning up containers
   - ❌ Test pollution
   - ❌ Race conditions in parallel tests

**Why We Chose Testcontainers:**
- Confidence > Speed for integration tests
- Catches real-world issues (constraints, indexes)
- Worth the 2-3s startup cost
- Docker is standard in dev environments
- Can still use unit tests (no DB) for business logic

---

## Monorepo Structure

### Decision: pnpm Workspaces

**Choice:** Monorepo with shared packages  
**Tradeoff:** Simplicity vs Coordination

#### Pros
✅ **Shared Code:** Reuse domain types across frontend/backend  
✅ **Atomic Changes:** Change interface + implementation in one PR  
✅ **Type Safety:** Frontend/backend share exact types  
✅ **Simpler Deployments:** One repo, one deploy  

#### Cons
❌ **Build Complexity:** Must build packages before app  
❌ **Dependency Management:** Workspace protocol, not standard npm  
❌ **All or Nothing:** Can't version packages independently  

**Alternatives Considered:**

1. **Polyrepo (Separate Repos)**
   - ✅ Independent versioning
   - ❌ Code duplication
   - ❌ Type mismatches between frontend/backend

2. **npm Workspaces**
   - ✅ Built into npm
   - ❌ Slower, less efficient
   - ❌ Weaker workspace features

3. **Turborepo**
   - ✅ Caching, parallel builds
   - ❌ Additional tool complexity
   - ❌ Overkill for our scale

**Why We Chose pnpm Workspaces:**
- Shared types between frontend/backend is huge win
- Faster than npm/yarn
- Disk space efficient
- Simple enough for small team
- Can add Turborepo later if needed

---

## Code Evaluation

### Decision: Delayed Implementation (Phase 2)

**Choice:** Build evaluation system in Phase 2, not Phase 1  
**Tradeoff:** MVP Speed vs Complete Feature

#### Why Deferred?
- Phase 1 focuses on practice workflow infrastructure
- Code execution sandboxing is complex (security, resource limits)
- Can mock evaluation results for UI development
- Allows time to research best approach (Docker, isolate-vm, etc.)

**Planned Approach (Phase 2):**
1. **Sandboxed Execution:** Docker containers or isolate-vm
2. **Test Case Runner:** Execute code against predefined test cases
3. **Resource Limits:** CPU/memory/time constraints
4. **Security:** Prevent file system access, network calls
5. **Language Support:** JavaScript/TypeScript initially, Python later

**Alternatives Being Considered:**
- **Judge0 API:** Third-party code execution service ($$)
- **Custom Docker:** Full isolation, but operational complexity
- **VM2/isolate-vm:** Lighter weight, but less isolation
- **WebAssembly:** Future option for client-side execution

---

## Stage Progression

### Decision: Gated Progression (No Skipping Stages)

**Choice:** Must complete each stage before advancing  
**Tradeoff:** Pedagogical Rigor vs User Freedom

#### Pros
✅ **Enforces Learning:** Students must plan before coding  
✅ **Better Outcomes:** Planning improves code quality  
✅ **Data Collection:** Track where students struggle  
✅ **Prevents Cheating:** Can't copy-paste without understanding  

#### Cons
❌ **Frustration:** Advanced users might feel constrained  
❌ **Rigid:** No flexibility for different learning styles  

**Why We Chose Gated:**
- Research supports staged problem-solving (Polya, etc.)
- Platform differentiator (not just another LeetCode clone)
- Can add "expert mode" later for skip permission
- Early users (students) need structure more than speed

---

## Guest-to-User Merge Strategy

### Decision: Preserve All Data (Deterministic)

**Choice:** Keep ALL guest sessions, even if duplicates  
**Tradeoff:** Data Clutter vs Data Loss

#### Why Preserve All?
- **No Data Loss:** Student work is precious
- **Deterministic:** Predictable behavior, no hidden rules
- **Simple Logic:** No complex merging algorithms
- **Audit Trail:** Can review duplicate sessions later

**Alternative Considered:**
- **Smart Merge:** Keep "best" session per problem
  - ❌ "Best" is subjective (most recent? highest score?)
  - ❌ Risk of losing valuable attempts
  - ❌ Complex logic, edge cases

**Mitigation for Clutter:**
- UI groups sessions by problem
- Can add "archive old sessions" feature later
- Users can manually delete unwanted sessions

---

## Summary of Key Tradeoffs

| Decision | Chose | Over | Why |
|----------|-------|------|-----|
| Sessions | Database | JWT | Security & revocation |
| Guests | Cookies | LocalStorage | Security (HttpOnly) |
| Database | Normalized | Denormalized | Data integrity |
| Data Access | Repository | ORM | SQL control |
| Concurrency | Revisions | Timestamps | Reliability |
| Testing | Testcontainers | Mocks | Real DB confidence |
| Monorepo | pnpm | Polyrepo | Shared types |
| Stages | Gated | Free | Pedagogy |
| Merge | Preserve All | Smart Merge | No data loss |

## Future Reevaluation Points

These decisions should be revisited if:

1. **User Scale:** > 100k concurrent users → Consider JWT + Redis
2. **Performance:** Database becomes bottleneck → Add caching layer
3. **Mobile Apps:** Native mobile → Consider GraphQL API
4. **Global Users:** Multi-region → Edge sessions, CDN
5. **Team Growth:** 5+ developers → Consider Turborepo, microservices

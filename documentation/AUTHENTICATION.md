# Authentication System

**Last Updated:** 2026-08-18

## Overview

The authentication system is built on NextAuth.js v5 with PostgreSQL-backed sessions, supporting both OAuth providers (Google, GitHub) and guest sessions with seamless account upgrade.

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────┐
│                    User Journey                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Guest User                    Authenticated User       │
│      │                                 │                │
│      ├──> Practice Problems           ├──> Full Access │
│      │    (Limited History)           │    (All Data)  │
│      │                                 │                │
│      └──> Sign In ──> Upgrade ────────┘                │
│           (OAuth)     (Merge Data)                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. NextAuth.js Configuration (`auth/config.ts`)

#### Session Strategy
```typescript
session: {
  strategy: 'database',  // Database-backed, not JWT
  maxAge: 30 * 24 * 60 * 60,  // 30 days
  updateAge: 24 * 60 * 60,     // Refresh every 24 hours
}
```

**Why Database Strategy?**
- ✅ Immediate session revocation
- ✅ Multi-device session management
- ✅ Session listing API
- ✅ Better security (can't forge tokens)

#### Cookie Configuration
```typescript
cookies: {
  sessionToken: {
    name: '__Secure-authjs.session-token',  // Production: __Secure- prefix
    options: {
      httpOnly: true,      // Prevent XSS
      sameSite: 'lax',     // CSRF protection
      path: '/',
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
    },
  },
}
```

**Security Features:**
- `httpOnly`: JavaScript cannot access cookie (prevents XSS)
- `sameSite: 'lax'`: Blocks cross-site requests (CSRF protection)
- `secure`: HTTPS-only transmission in production
- `__Secure-` prefix: Browser enforces secure flag

#### OAuth Providers

**Google OAuth**
```typescript
GoogleProvider({
  clientId: process.env.AUTH_GOOGLE_ID!,
  clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  allowDangerousEmailAccountLinking: true,  // Enable guest upgrade
})
```

**GitHub OAuth**
```typescript
GitHubProvider({
  clientId: process.env.AUTH_GITHUB_ID!,
  clientSecret: process.env.AUTH_GITHUB_SECRET!,
  allowDangerousEmailAccountLinking: true,
})
```

**Why `allowDangerousEmailAccountLinking`?**
- Enables guest-to-user upgrade when email matches
- "Dangerous" because it trusts email verification from OAuth provider
- Safe in our case: Google/GitHub verify emails rigorously
- Without it, guest sessions can't be merged with OAuth accounts

#### Callbacks

**signIn Callback**
```typescript
async signIn({ user, account, profile }) {
  // Check if upgrading from guest session
  const guestId = await getGuestSessionId();
  if (guestId) {
    await upgradeGuestToUser(guestId, user.id);
  }
  return true;
}
```

**session Callback**
```typescript
async session({ session, user }) {
  // Enrich session with user properties
  if (session.user) {
    session.user.id = user.id;
    session.user.role = user.role;
    session.user.displayName = user.displayName;
  }
  return session;
}
```

### 2. Custom Database Adapter (`auth/adapter.ts`)

NextAuth requires an "Adapter" to interface with the database. We created a custom adapter that integrates with our repository pattern.

#### Key Methods

**User Management**
```typescript
createUser: async (data) => {
  const user = await userRepo.create({
    email: data.email,
    emailVerified: data.emailVerified,
    displayName: data.name,
    role: 'learner',
    preferences: {},
  });
  return toAdapterUser(user);
}

getUserByEmail: async (email) => {
  const user = await userRepo.findByEmail(email);
  return user ? toAdapterUser(user) : null;
}
```

**Session Management**
```typescript
createSession: async ({ sessionToken, userId, expires }) => {
  await db.query(
    'INSERT INTO sessions (session_token, user_id, expires) VALUES ($1, $2, $3)',
    [sessionToken, userId, expires]
  );
  return { sessionToken, userId, expires };
}

getSessionAndUser: async (sessionToken) => {
  const result = await db.query(`
    SELECT s.*, u.* 
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = $1 AND s.expires > NOW()
  `, [sessionToken]);
  
  if (!result.rows[0]) return null;
  
  return {
    session: toAdapterSession(result.rows[0]),
    user: toAdapterUser(result.rows[0]),
  };
}

deleteSession: async (sessionToken) => {
  await db.query('DELETE FROM sessions WHERE session_token = $1', [sessionToken]);
}
```

**Account Linking (OAuth)**
```typescript
linkAccount: async (account) => {
  await db.query(`
    INSERT INTO accounts (
      user_id, type, provider, provider_account_id,
      access_token, refresh_token, expires_at, token_type, scope
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    account.userId,
    account.type,
    account.provider,
    account.providerAccountId,
    account.access_token,
    account.refresh_token,
    account.expires_at,
    account.token_type,
    account.scope,
  ]);
}
```

### 3. Session Utilities (`auth/session.ts`)

#### Authenticated Sessions

**Get Current Session**
```typescript
export async function getSession(): Promise<Session | null> {
  return await auth();  // NextAuth's auth() function
}
```

**Require Authentication (Throws if Not Logged In)**
```typescript
export async function requireAuth(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized: Authentication required');
  }
  return session;
}
```

#### Guest Sessions

**Cookie Name**
```typescript
const GUEST_SESSION_COOKIE = 'leetcode-app.guest-session';
```

**Get or Create Guest Session**
```typescript
export async function getOrCreateGuestSession(): Promise<GuestSession> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(GUEST_SESSION_COOKIE);
  
  if (existingCookie) {
    try {
      const guestSession = JSON.parse(existingCookie.value);
      return guestSession;
    } catch {
      // Invalid cookie, create new session
    }
  }
  
  // Create new guest identity
  const guestId = randomUUID();
  await guestRepo.create(guestId);
  
  const guestSession: GuestSession = {
    id: guestId,
    createdAt: new Date(),
  };
  
  // Set HTTP-only cookie (1 year expiration)
  cookieStore.set(GUEST_SESSION_COOKIE, JSON.stringify(guestSession), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60,  // 1 year
    path: '/',
  });
  
  return guestSession;
}
```

**Clear Guest Session (After Upgrade)**
```typescript
export async function clearGuestSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_SESSION_COOKIE);
}
```

**Get Current User ID (User or Guest)**
```typescript
export async function getCurrentUserId(): Promise<{ type: 'user' | 'guest'; id: string }> {
  const session = await getSession();
  if (session?.user?.id) {
    return { type: 'user', id: session.user.id };
  }
  
  const guestSession = await getGuestSession();
  if (guestSession) {
    return { type: 'guest', id: guestSession.id };
  }
  
  throw new Error('No active session');
}
```

### 4. Guest-to-User Upgrade (`api/auth/upgrade-guest/route.ts`)

#### Upgrade Flow

1. **User signs in with OAuth** (Google/GitHub)
2. **NextAuth creates user account**
3. **Frontend calls POST /api/auth/upgrade-guest**
4. **Backend merges guest data into user account**

#### Implementation

```typescript
export async function POST(request: Request) {
  // Require authentication
  const session = await requireAuth();
  const userId = session.user.id;
  
  // Check for guest session
  const guestSession = await getGuestSession();
  if (!guestSession) {
    return NextResponse.json(
      { error: 'No guest session found' },
      { status: 400 }
    );
  }
  
  const db = createDatabaseClient();
  
  try {
    // Start transaction
    await db.query('BEGIN');
    
    // Check guest identity exists
    const guestExists = await guestRepo.findById(guestSession.id);
    if (!guestExists) {
      throw new Error('Guest identity not found');
    }
    
    // Merge all practice sessions (deterministic: keep all)
    const result = await db.query(`
      UPDATE practice_sessions
      SET user_id = $1, guest_id = NULL
      WHERE guest_id = $2
      RETURNING id
    `, [userId, guestSession.id]);
    
    const mergedSessions = result.rows.length;
    
    // Commit transaction
    await db.query('COMMIT');
    
    // Clear guest cookie
    await clearGuestSession();
    
    return NextResponse.json({
      success: true,
      merged: {
        practice_sessions: mergedSessions,
      },
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Guest upgrade failed:', error);
    return NextResponse.json(
      { error: 'Failed to upgrade guest session' },
      { status: 500 }
    );
  } finally {
    await db.close();
  }
}
```

**Deterministic Merge Behavior:**
- ✅ **All** guest sessions transferred to user
- ✅ **All** attempts preserved
- ✅ **All** pseudocode revisions kept
- ✅ No data loss, even if user already has sessions for same problems
- ✅ UI can handle duplicate sessions (group by problem, show latest)

### 5. Session Management APIs

#### List All Sessions (`GET /api/sessions`)

```typescript
export async function GET(request: Request) {
  const session = await requireAuth();
  const userId = session.user.id;
  
  const db = createDatabaseClient();
  
  const result = await db.query(`
    SELECT id, session_token, created_at, updated_at, expires
    FROM sessions
    WHERE user_id = $1 AND expires > NOW()
    ORDER BY updated_at DESC
  `, [userId]);
  
  const sessions = result.rows.map(row => ({
    id: row.id,
    tokenPreview: row.session_token.substring(0, 8) + '...',
    createdAt: row.created_at,
    lastActive: row.updated_at,
    expires: row.expires,
    isCurrent: row.session_token === getCurrentSessionToken(),
  }));
  
  return NextResponse.json({ sessions });
}
```

**Response Example:**
```json
{
  "sessions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "tokenPreview": "a1b2c3d4...",
      "createdAt": "2026-08-01T10:00:00Z",
      "lastActive": "2026-08-18T15:30:00Z",
      "expires": "2026-09-17T15:30:00Z",
      "isCurrent": true
    },
    {
      "id": "223e4567-e89b-12d3-a456-426614174001",
      "tokenPreview": "e5f6g7h8...",
      "createdAt": "2026-07-20T12:00:00Z",
      "lastActive": "2026-08-15T09:00:00Z",
      "expires": "2026-09-14T09:00:00Z",
      "isCurrent": false
    }
  ]
}
```

#### Revoke Session (`DELETE /api/sessions/[sessionId]`)

```typescript
export async function DELETE(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  const session = await requireAuth();
  const userId = session.user.id;
  const { sessionId } = params;
  
  const db = createDatabaseClient();
  
  // Verify ownership before deletion
  const checkResult = await db.query(
    'SELECT user_id FROM sessions WHERE id = $1',
    [sessionId]
  );
  
  if (checkResult.rows.length === 0) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 404 }
    );
  }
  
  if (checkResult.rows[0].user_id !== userId) {
    return NextResponse.json(
      { error: 'Forbidden: Cannot revoke another user\'s session' },
      { status: 403 }
    );
  }
  
  // Delete session
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  
  return NextResponse.json({ success: true });
}
```

## Database Schema

### Users Table
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
```

### Guest Identities Table
```sql
CREATE TABLE guest_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Accounts Table (OAuth)
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
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires);
CREATE INDEX idx_sessions_token ON sessions(session_token);
```

### Verification Tokens Table
```sql
CREATE TABLE verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier, token)
);
```

## Security Considerations

### CSRF Protection
- ✅ `sameSite: 'lax'` cookie attribute
- ✅ NextAuth auto-generates CSRF tokens
- ✅ POST requests require CSRF token validation

### Session Fixation Prevention
- ✅ New session token generated on authentication
- ✅ Old tokens invalidated
- ✅ Cannot reuse pre-existing tokens

### XSS Prevention
- ✅ `httpOnly` cookie attribute (no JavaScript access)
- ✅ Content Security Policy headers
- ✅ No user input rendered without sanitization

### Token Security
- ✅ Session tokens are random UUIDs (high entropy)
- ✅ HTTPS-only in production (`secure` flag)
- ✅ Short-lived (30 days with 24-hour refresh)

### Data Ownership
- ✅ All API endpoints validate `userId` matches session
- ✅ Foreign key constraints prevent orphaned data
- ✅ Cascade deletes for GDPR compliance

## Environment Variables

Required in `.env`:

```bash
# NextAuth Configuration
AUTH_SECRET=<generated-with-openssl-rand-base64-32>
NEXTAUTH_URL=http://localhost:3000  # Production: https://yourdomain.com

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
POSTGRES_PASSWORD=<secure-password>
```

## Testing

See [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) for comprehensive testing documentation.

### Security Tests Implemented

1. ✅ **CSRF Protection:** Validates secure cookie settings
2. ✅ **Session Fixation Prevention:** New tokens on auth
3. ✅ **Object Ownership:** Users can only access their data
4. ✅ **Logout Functionality:** Sessions properly deleted
5. ✅ **Revoked Session Handling:** Revoked sessions unusable
6. ✅ **Guest Merge Collision:** Deterministic data preservation

## Common Workflows

### Sign In Flow
```
1. User clicks "Sign in with Google"
2. Redirect to Google OAuth consent screen
3. User approves
4. Google redirects to /api/auth/callback/google
5. NextAuth creates/retrieves user
6. Check for guest session cookie
7. If found, merge guest data into user account
8. Create database session
9. Set session cookie
10. Redirect to dashboard
```

### Guest Practice Flow
```
1. User visits site (no account)
2. Starts practice on a problem
3. Backend checks for guest cookie
4. If none exists, create guest identity + set cookie
5. Practice sessions linked to guest_id
6. User continues practicing
7. Optionally: Sign up later to preserve progress
```

### Logout Flow
```
1. User clicks "Sign out"
2. POST /api/auth/signout
3. Delete session from database
4. Clear session cookie
5. Redirect to home page
```

### Revoke Device Session Flow
```
1. User goes to Account Settings > Sessions
2. GET /api/sessions (list all active sessions)
3. User clicks "Revoke" on suspicious session
4. DELETE /api/sessions/[sessionId]
5. That device immediately logged out
```

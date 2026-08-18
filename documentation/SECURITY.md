# Security

**Last Updated:** 2026-08-18

## Overview

Security is a core requirement for an educational platform handling user data and code execution. This document outlines our security model, threat analysis, and mitigations.

## Threat Model

### Assets to Protect
1. **User Credentials:** Passwords, OAuth tokens, session tokens
2. **User Data:** Practice sessions, code attempts, progress
3. **Platform Integrity:** Prevent abuse, data corruption
4. **System Resources:** CPU, memory, database connections

### Threat Actors
1. **Malicious Users:** Steal other users' data, cheat, abuse resources
2. **External Attackers:** Gain unauthorized access, DDoS, data breach
3. **Insider Threats:** Compromised admin accounts (future concern)

### Attack Vectors
- **CSRF:** Cross-site request forgery
- **XSS:** Cross-site scripting
- **SQL Injection:** Malicious SQL queries
- **Session Hijacking:** Steal session tokens
- **Privilege Escalation:** Access admin features
- **Code Injection:** Malicious code execution (eval, file system access)
- **Rate Limiting:** Brute force, DDoS

## Security Controls

### 1. Authentication Security

#### OAuth 2.0 with Trusted Providers
✅ **Mitigation:** Use Google and GitHub OAuth  
✅ **Benefit:** Offload credential management to trusted providers  
✅ **Prevents:** Password leaks, weak passwords, phishing

**Implementation:**
```typescript
GoogleProvider({
  clientId: process.env.AUTH_GOOGLE_ID!,
  clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  authorization: {
    params: {
      prompt: 'consent',
      access_type: 'offline',
      response_type: 'code',
    },
  },
})
```

#### Database-Backed Sessions
✅ **Mitigation:** Store sessions in PostgreSQL, not JWT  
✅ **Benefit:** Immediate revocation, session listing  
✅ **Prevents:** Stolen token persistence

**Configuration:**
```typescript
session: {
  strategy: 'database',
  maxAge: 30 * 24 * 60 * 60,    // 30 days
  updateAge: 24 * 60 * 60,      // Refresh every 24 hours
}
```

#### Secure Cookies
✅ **Mitigation:** `httpOnly`, `sameSite`, `secure` flags  
✅ **Benefit:** Prevent XSS and CSRF  
✅ **Prevents:** Cookie theft, cross-site attacks

**Cookie Settings:**
```typescript
cookies: {
  sessionToken: {
    name: '__Secure-authjs.session-token',
    options: {
      httpOnly: true,         // No JavaScript access
      sameSite: 'lax',        // CSRF protection
      secure: true,           // HTTPS only (production)
      path: '/',
    },
  },
}
```

### 2. CSRF Protection

**Mitigation:** SameSite cookies + CSRF tokens

#### SameSite Cookies
```typescript
sameSite: 'lax'  // Blocks cross-site POST requests
```

#### CSRF Token Validation
NextAuth automatically generates and validates CSRF tokens on state-changing requests.

**Test Coverage:**
```typescript
it('should reject POST without CSRF token', async () => {
  const response = await fetch('/api/auth/signout', {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    // No CSRF token
  });
  
  expect(response.status).toBe(403);
});
```

### 3. XSS Prevention

#### HTTP-Only Cookies
✅ **Mitigation:** Session cookies inaccessible to JavaScript  
✅ **Prevents:** `document.cookie` theft via XSS

#### Content Security Policy (CSP)
**Planned (Phase 2):**
```typescript
headers: {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",  // CodeMirror needs eval
    "style-src 'self' 'unsafe-inline'", // Tailwind needs inline
    "connect-src 'self' https://apis.google.com",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
  ].join('; '),
}
```

#### Input Sanitization
✅ **Mitigation:** React auto-escapes JSX  
✅ **Manual Sanitization:** Use DOMPurify for user-generated HTML

**Example:**
```typescript
import DOMPurify from 'dompurify';

function renderUserContent(html: string) {
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

### 4. SQL Injection Prevention

#### Parameterized Queries
✅ **Mitigation:** Use `$1, $2` placeholders, never string concatenation  
✅ **Benefit:** Database driver handles escaping

**Safe:**
```typescript
await db.query(
  'SELECT * FROM users WHERE email = $1',
  [userInput]
);
```

**Unsafe (NEVER DO THIS):**
```typescript
// ❌ SQL INJECTION VULNERABILITY
await db.query(
  `SELECT * FROM users WHERE email = '${userInput}'`
);
```

#### ORM/Query Builder (Not Used)
We use raw SQL with parameterized queries instead of an ORM. This gives us full control while preventing SQL injection via the driver.

### 5. Session Security

#### Session Fixation Prevention
✅ **Mitigation:** Generate new token on authentication  
✅ **Benefit:** Old tokens invalidated

**Test:**
```typescript
it('should generate new token on sign-in', async () => {
  const preAuthToken = getSessionToken();
  await signIn('google');
  const postAuthToken = getSessionToken();
  
  expect(postAuthToken).not.toBe(preAuthToken);
});
```

#### Session Expiration
✅ **Mitigation:** 30-day max age, 24-hour refresh  
✅ **Benefit:** Limits token lifetime

**Automatic Cleanup:**
```sql
-- Query only returns sessions that haven't expired
SELECT * FROM sessions 
WHERE session_token = $1 AND expires > NOW()
```

#### Session Revocation
✅ **Mitigation:** DELETE from database immediately  
✅ **Benefit:** Instant logout across all devices

**Implementation:**
```typescript
export async function revokeSession(sessionId: string) {
  await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}
```

### 6. Object Ownership Enforcement

**Principle:** Users can only access their own data.

#### User ID Validation
Every API endpoint validates `userId` matches the authenticated session.

**Pattern:**
```typescript
export async function GET(request: Request, { params }: { params: { sessionId: string } }) {
  const session = await requireAuth();
  const userId = session.user.id;
  
  // Verify ownership
  const result = await db.query(
    'SELECT * FROM practice_sessions WHERE id = $1',
    [params.sessionId]
  );
  
  if (result.rows[0]?.user_id !== userId && result.rows[0]?.guest_id !== guestId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  // ... continue
}
```

#### Foreign Key Constraints
✅ **Mitigation:** Database enforces relationships  
✅ **Benefit:** Prevents orphaned data

**Example:**
```sql
CREATE TABLE practice_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_id VARCHAR(255) REFERENCES content_items(id) ON DELETE CASCADE,
  -- ...
);
```

#### Row-Level Security (Future)
**Planned (Phase 3):** Use PostgreSQL RLS policies.

```sql
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_practice_sessions ON practice_sessions
  FOR ALL
  TO authenticated_user
  USING (user_id = current_setting('app.user_id')::uuid);
```

### 7. Rate Limiting (Planned - Phase 2)

**Mitigation:** Prevent brute force, DDoS, abuse

#### API Rate Limits
- **Guest Users:** 100 requests/hour
- **Authenticated Users:** 1000 requests/hour
- **Premium Users:** 10,000 requests/hour

**Implementation (Upstash Redis):**
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 h'),  // 100 requests per hour
});

export async function middleware(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'X-RateLimit-Reset': reset.toString() } }
    );
  }
  
  return NextResponse.next();
}
```

### 8. Code Execution Security (Planned - Phase 2)

**Threat:** Users submit malicious code that harms the system.

#### Sandboxing Strategy

**Option 1: Docker Containers (Recommended)**
```typescript
import Docker from 'dockerode';

async function executeCode(code: string, language: string) {
  const docker = new Docker();
  
  const container = await docker.createContainer({
    Image: `leetcode-executor-${language}:latest`,
    Cmd: ['node', '/app/execute.js'],
    HostConfig: {
      Memory: 128 * 1024 * 1024,      // 128 MB RAM
      NanoCpus: 500000000,             // 0.5 CPU
      NetworkMode: 'none',             // No network access
      ReadonlyRootfs: true,            // No file writes
      Tmpfs: { '/tmp': 'size=10m' },   // Limited tmp space
    },
    Env: [`CODE=${Buffer.from(code).toString('base64')}`],
  });
  
  await container.start();
  
  const timeout = setTimeout(() => container.kill(), 5000);  // 5s max
  
  const output = await container.wait();
  clearTimeout(timeout);
  
  await container.remove();
  
  return output;
}
```

**Security Features:**
- ✅ Memory limit (128 MB)
- ✅ CPU limit (0.5 cores)
- ✅ No network access
- ✅ Read-only file system
- ✅ Time limit (5 seconds)
- ✅ Isolated from host

**Option 2: VM2 / isolate-vm (Lighter Weight)**
```typescript
import ivm from 'isolated-vm';

async function executeCode(code: string) {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });  // 128 MB
  const context = await isolate.createContext();
  
  const jail = context.global;
  await jail.set('global', jail.derefInto());
  
  const script = await isolate.compileScript(code);
  const result = await script.run(context, { timeout: 5000 });  // 5s max
  
  return result;
}
```

**Security Features:**
- ✅ Memory limit
- ✅ Time limit
- ✅ No file system access
- ✅ No network access
- ❌ Less isolated than Docker

### 9. Environment Variables

**Mitigation:** Never commit secrets to Git

#### .env.local (Gitignored)
```bash
# Authentication
AUTH_SECRET=<generated-with-openssl-rand-base64-32>
AUTH_GOOGLE_ID=<secret>
AUTH_GOOGLE_SECRET=<secret>
AUTH_GITHUB_ID=<secret>
AUTH_GITHUB_SECRET=<secret>

# Database
POSTGRES_PASSWORD=<secret>
```

#### .env.example (Committed)
```bash
# Authentication (generate: openssl rand -base64 32)
AUTH_SECRET=your-secret-here
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
AUTH_GITHUB_ID=your-github-client-id
AUTH_GITHUB_SECRET=your-github-client-secret

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=leetcode_app
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password-here
```

#### Validation
```typescript
const requiredEnvVars = [
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'POSTGRES_HOST',
  'POSTGRES_PASSWORD',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
```

### 10. Logging & Monitoring (Planned - Phase 2)

#### Security Event Logging
```typescript
async function logSecurityEvent(event: {
  type: 'unauthorized_access' | 'rate_limit_exceeded' | 'suspicious_activity';
  userId?: string;
  ip: string;
  details: Record<string, any>;
}) {
  await db.query(`
    INSERT INTO security_logs (type, user_id, ip_address, details, created_at)
    VALUES ($1, $2, $3, $4, NOW())
  `, [event.type, event.userId, event.ip, JSON.stringify(event.details)]);
  
  // Alert if critical
  if (event.type === 'unauthorized_access') {
    await sendAlert(event);
  }
}
```

#### Sentry Integration
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  
  beforeSend(event, hint) {
    // Redact sensitive data
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },
});
```

### 11. Database Security

#### Connection Pooling
```typescript
const pool = new Pool({
  max: 20,                  // Max connections
  idleTimeoutMillis: 30000, // Close idle connections
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
});
```

#### Encrypted Connections (Production)
```typescript
ssl: {
  rejectUnauthorized: true,  // Verify certificate
  ca: fs.readFileSync('/path/to/ca-cert.pem'),
}
```

#### Least Privilege Principle
```sql
-- Create app-specific user (not superuser)
CREATE USER leetcode_app WITH PASSWORD 'secure-password';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE leetcode_app TO leetcode_app;
GRANT USAGE ON SCHEMA public TO leetcode_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO leetcode_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leetcode_app;

-- Revoke dangerous permissions
REVOKE CREATE ON SCHEMA public FROM leetcode_app;
```

### 12. HTTPS Enforcement

#### Production Configuration
```typescript
// next.config.ts
export default {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',  // HSTS
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',  // Prevent clickjacking
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',  // Prevent MIME sniffing
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};
```

#### Vercel Automatic HTTPS
Vercel automatically provisions SSL certificates via Let's Encrypt.

### 13. Dependency Security

#### Regular Audits
```bash
pnpm audit                # Check for vulnerabilities
pnpm audit --fix          # Auto-fix if possible
```

#### Dependabot (GitHub)
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

#### Snyk Integration (Planned)
Continuous dependency monitoring and automated security fixes.

## Security Checklist

### Pre-Production
- [x] Database sessions (not JWT)
- [x] HTTP-only, SameSite cookies
- [x] CSRF protection enabled
- [x] Parameterized SQL queries
- [x] Object ownership checks
- [x] Session revocation API
- [x] Guest-to-user upgrade secure
- [ ] Rate limiting implemented
- [ ] CSP headers configured
- [ ] HTTPS enforced
- [ ] Error messages sanitized (no stack traces to users)
- [ ] Sentry integrated
- [ ] Security event logging
- [ ] Code execution sandboxed

### Post-Production
- [ ] Regular security audits
- [ ] Penetration testing
- [ ] Bug bounty program
- [ ] Incident response plan
- [ ] GDPR compliance review
- [ ] CCPA compliance review

## Incident Response Plan (Draft)

### 1. Detection
- Monitor Sentry for unusual error spikes
- Check security logs for unauthorized access patterns
- User reports of suspicious activity

### 2. Containment
- Revoke affected sessions immediately
- Block malicious IP addresses (Cloudflare)
- Disable compromised features temporarily

### 3. Investigation
- Review logs to determine scope
- Identify vulnerability exploited
- Document timeline of events

### 4. Remediation
- Deploy security patch
- Reset affected user sessions
- Notify affected users (if data breach)

### 5. Post-Incident
- Update security documentation
- Add new test coverage
- Review and improve monitoring

## Compliance

### GDPR (General Data Protection Regulation)
- ✅ User can delete account (CASCADE deletes all data)
- ✅ User can export data (planned API)
- ✅ Clear privacy policy (Phase 2)
- ✅ Cookie consent banner (Phase 2)

### CCPA (California Consumer Privacy Act)
- ✅ User can request data deletion
- ✅ User can request data export
- ✅ No selling of user data

### COPPA (Children's Online Privacy Protection Act)
- ⚠️ **Consideration:** If targeting users under 13, need parental consent
- **Current Approach:** Target college students (18+) in Phase 1

## Security Testing

See [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) for full test coverage.

### Automated Security Tests
- ✅ CSRF protection validation
- ✅ Session fixation prevention
- ✅ Object ownership enforcement
- ✅ Logout functionality
- ✅ Revoked session handling
- ✅ Guest merge security

### Manual Security Testing (Planned)
- [ ] Penetration testing (Phase 2)
- [ ] OWASP Top 10 validation
- [ ] Code review by security expert

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NextAuth.js Security](https://next-auth.js.org/configuration/options#security)
- [Node.js Security Checklist](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

# ADR-002: Identity and Authentication

## Status

Accepted

## Context

The application requires user identity for persistence, progress tracking, and personalization. We need a secure, accessible authentication system that supports guest-to-account upgrades and multi-device sessions.

## Decision

### Identity Provider

**Use managed identity provider: Auth0 (or Firebase Auth as alternative)**

Rationale:
- Handles OAuth flows, session management, and password policies
- Built-in MFA, breach detection, and anomaly detection
- Supports magic links (passwordless) for accessibility
- GDPR/COPPA compliance features
- Reduces security surface area vs. custom implementation

### Supported Authentication Methods

1. **Email Magic Link** (primary) - Passwordless, accessible, reduces password fatigue
2. **Google OAuth** - Ubiquitous, trusted provider
3. **GitHub OAuth** - Developer-focused audience alignment
4. **Guest Mode** - Secure temporary identity stored in database, not just localStorage

### Identity Architecture

```
User Identity (UUID)
├── Authentication Method (Auth0 user_id)
├── Profile (email, name, preferences)
├── Sessions (multiple devices)
└── Guest-to-Account Migration (one-time merge)
```

### Security Requirements

- **Session Duration:** 30 days with automatic refresh, revocable
- **Device Management:** Users can view and revoke active sessions
- **Guest Security:** Guest IDs stored server-side with secure HTTP-only cookies
- **Migration:** Guest data merged into authenticated account on upgrade
- **No Credentials in Code:** Use workload identity/environment variables only

### Guest-to-Account Flow

1. Guest creates attempt data with anonymous UUID
2. User authenticates via magic link or OAuth
3. Backend merges guest attempts into new account
4. Guest cookie invalidated, authenticated session established
5. Collision handling: Preserve all attempts, no data loss

## Consequences

### Easier

- No password management complexity
- Built-in security features (MFA, breach detection)
- Multi-device support out of the box
- Guest mode enables immediate engagement

### More Difficult

- Vendor lock-in to identity provider
- Additional cost for Auth0/Firebase
- Migration complexity if changing providers
- Must test edge cases in guest-to-account merge

## Review Date

2027-02-17 (6 months) - Review Auth0 costs, evaluate self-hosted alternatives if scale demands

## Owners

- Security Lead: Responsible for configuration review
- Backend Lead: Responsible for integration and migration logic

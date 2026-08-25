# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

During the MVP development phase (Phase 0-9), only the latest version on `main` is supported. Once we reach public release (Phase 9), we'll establish a formal versioning and support policy.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

### Reporting Process

1. **Email:** Send details to [security@leetcode-app.example.com](mailto:security@leetcode-app.example.com)
   - Or use GitHub Security Advisories (private disclosure)

2. **Include in your report:**
   - Type of issue (e.g., SQL injection, XSS, authentication bypass)
   - Full paths of source file(s) related to the issue
   - Location of the affected code (tag/branch/commit or direct URL)
   - Step-by-step instructions to reproduce the issue
   - Proof-of-concept or exploit code (if possible)
   - Impact assessment (what an attacker could do)
   - Any suggested fixes (optional)

3. **Response Timeline:**
   - **Initial Response:** Within 48 hours
   - **Triage and Assessment:** Within 7 days
   - **Fix Development:** Depends on severity (see below)
   - **Public Disclosure:** After fix is deployed and verified

### Severity Levels and Response Times

| Severity | Description | Fix Timeline |
|----------|-------------|--------------|
| **Critical** | Remote code execution, authentication bypass, data breach | 24-48 hours |
| **High** | Privilege escalation, XSS with session hijacking, SQL injection | 7 days |
| **Medium** | CSRF, non-critical XSS, information disclosure | 30 days |
| **Low** | Minor information leakage, missing security headers | Next release |

## Security Best Practices for Contributors

### Code Review

- All code changes require approval from at least one maintainer
- Security-sensitive changes require review from security team
- No credentials or secrets in code (use environment variables)

### Dependencies

- Dependabot enabled for automated vulnerability scanning
- Run `npm audit` before every release
- Pin exact versions for production dependencies
- Regularly update dependencies (weekly review)

### Authentication & Authorization

- Use Auth0 or similar managed identity provider
- Implement proper session management
- Never store passwords in plain text
- Use HTTPS for all production traffic
- Implement rate limiting on authentication endpoints

### Data Protection

- Hash user IDs in logs (never log PII)
- Encrypt sensitive data at rest
- Use parameterized queries (prevent SQL injection)
- Sanitize user input (prevent XSS)
- Implement CORS policies
- Use Content Security Policy headers

### Code Execution

- Sandbox all user code execution (Judge0 or similar)
- Strict resource limits (CPU, memory, time)
- No network access for sandboxed code
- Validate and sanitize all input before execution

### API Security

- Implement authentication on all API endpoints
- Use API rate limiting
- Validate all request payloads
- Return appropriate error codes (don't leak internal details)
- Log security events (failed auth, suspicious patterns)

## Threat Model

Our threat model considers the following attack vectors:

1. **User Data Exfiltration**
   - Mitigation: HTTPS, encryption at rest, access controls

2. **Code Injection**
   - Mitigation: Input sanitization, sandboxed execution, CSP headers

3. **Authentication Bypass**
   - Mitigation: Managed identity provider, MFA, session management

4. **Denial of Service**
   - Mitigation: Rate limiting, resource quotas, monitoring

5. **AI Prompt Injection**
   - Mitigation: Input sanitization, delimiters, structured output schemas

## Security Testing

### Automated

- Dependabot for dependency vulnerabilities
- CodeQL for static analysis
- npm audit in CI pipeline
- OWASP ZAP for dynamic scanning (pre-release)

### Manual

- Security review before each phase gate
- Penetration testing before public release (Phase 9)
- Third-party security audit (planned for Phase 9)

## Disclosure Policy

- **Coordinated Disclosure:** We prefer coordinated disclosure
- **Public Disclosure:** After fix is deployed and verified (typically 90 days max)
- **Credits:** We acknowledge security researchers in our CHANGELOG (with permission)
- **Bug Bounty:** Not currently available, may be added post-launch

## Security Contacts

- **Security Team:** [security@leetcode-app.example.com](mailto:security@leetcode-app.example.com)
- **Incident Response:** [incident-response@leetcode-app.example.com](mailto:incident-response@leetcode-app.example.com)
- **Privacy Officer:** [privacy@leetcode-app.example.com](mailto:privacy@leetcode-app.example.com)

## Compliance

We aim to comply with:
- GDPR (General Data Protection Regulation)
- COPPA (Children's Online Privacy Protection Act)
- CCPA (California Consumer Privacy Act)
- SOC 2 Type II (planned for Phase 9)

## Security Updates

Subscribe to security advisories:
- Watch this repository for security announcements
- Enable GitHub Security Advisories notifications
- Monitor our status page (post-launch)

## Questions?

For security-related questions that are not sensitive:
- Open a [GitHub Discussion](https://github.com/your-org/leetcode-app/discussions)
- Tag with `security` label

For sensitive questions:
- Email [security@leetcode-app.example.com](mailto:security@leetcode-app.example.com)

# ADR-006: Code Sandbox

## Status

Accepted

## Context

Users must be able to execute their code implementations safely. Untrusted code execution poses severe security risks including data exfiltration, resource exhaustion, and lateral movement. We need a hardened sandbox that provides functional execution while preventing abuse.

## Decision

### Sandbox Strategy

**Isolated container execution with strict resource and network controls**

Primary Options Evaluated:
1. **Judge0** - Open-source execution API
2. **Piston** - Lightweight execution engine  
3. **Custom gVisor/Firecracker** - Container/microVM isolation
4. **Cloud Functions** - Managed serverless (AWS Lambda, Google Cloud Functions)

**Selected: Vercel Sandbox for the Vercel deployment, with Judge0 retained as a self-hosted fallback**

Rationale:
- Firecracker microVM isolation keeps untrusted code outside the web function
- TypeScript and Python are available in the managed universal image
- Network policy can deny all sandbox egress
- Production uses short-lived Vercel OIDC instead of a stored sandbox token
- Judge0 remains available where self-hosting or broader language support is required

### Security Architecture

```
┌─────────────┐
│ Execution   │
│ Worker      │
└──────┬──────┘
       │ (enqueue)
       ▼
┌──────────────────┐
│ Execution Queue  │
└──────┬───────────┘
       │
       ▼
┌──────────────────────────────────┐
│   Vercel Sandbox microVM         │
│   ┌──────────────────────┐       │
│   │  Execution Container │       │
│   │  • No network access │       │
│   │  • Read-only FS      │       │
│   │  • CPU/memory limits │       │
│   │  • 30s timeout       │       │
│   └──────────────────────┘       │
└──────────────────────────────────┘
```

### Resource Limits (per execution)

- **CPU:** 1 vCPU microVM
- **Memory:** 2 GB microVM; language processes receive tighter runtime limits
- **Execution Time:** 3 seconds for current practice verification
- **Network:** Disabled completely
- **Filesystem:** Ephemeral and destroyed after each run
- **Output:** 50 KB application cap, with a shell file-size limit as defense in depth

### Quota System

Per user per day:
- **Free Tier:** 50 executions
- **Authenticated:** 200 executions
- **Rate Limit:** 10 executions per 10 minutes

Per IP:
- **Maximum:** 100 executions per day (prevents abuse via guest accounts)

### Test Strategy

Code submissions run against:
1. **Public Tests:** Visible to user (3-5 test cases)
2. **Hidden Tests:** Validates correctness without revealing edge cases (5-10 test cases)
3. **Stress Tests:** Large inputs to verify complexity claims
4. **Security Tests:** Attempted escapes, resource exhaustion

### Monitoring and Abuse Detection

Alert on:
- Repeated timeout attempts (potential DoS)
- Network access attempts (blocked but logged)
- Filesystem escape attempts
- Quota exhaustion patterns
- Container crashes or OOM kills

### Supported Runtimes

**Phase 1:**
- Python 3.14 (managed universal image)
- TypeScript transpiled server-side and executed on Node.js 24

**Future:**
- Java, C++, Go through Judge0 or reviewed custom images after security review

### Failure Modes

- **Timeout:** Return timeout error with partial output
- **Memory Exceeded:** Return OOM error
- **Runtime Error:** Capture stderr and return to user
- **Crash:** Log incident, return generic error to user
- **Queue Full:** Return 429 with retry-after header

## Consequences

### Easier

- Users can validate their implementations
- Multi-language support from single system
- Proven security model from established platforms
- No separate sandbox cluster or long-lived production token is required on Vercel

### More Difficult

- Provider usage, quotas, and platform availability must be monitored
- Judge0 maintenance remains necessary only for self-hosted deployments
- Performance tuning for cold starts
- Cost of dedicated execution infrastructure
- Sophisticated abuse detection needed

## Review Date

2027-02-17 (6 months) - Review security incidents, performance metrics, abuse patterns, and cost per execution

## Owners

- Security Lead: Sandbox hardening and security review
- DevOps Lead: Infrastructure and monitoring
- Backend Lead: Queue integration and quota enforcement

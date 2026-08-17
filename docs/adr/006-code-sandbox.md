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

**Selected: Judge0 with custom hardening on Kubernetes**

Rationale:
- Open-source with active maintenance
- Multi-language support (TypeScript via Deno, Python)
- Built-in resource limiting and networking controls
- Can be self-hosted for privacy compliance
- Proven security model used by competitive programming platforms

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
│   Isolated Judge0 Instance       │
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

- **CPU:** 1 core, 50% throttle
- **Memory:** 256 MB
- **Execution Time:** 30 seconds max
- **Network:** Disabled completely
- **Filesystem:** Read-only except /tmp (50 MB)
- **Processes:** Max 10 processes
- **File Descriptors:** Max 50

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
- Python 3.11+ (via Judge0)
- TypeScript/JavaScript (via Deno in Judge0)

**Future:**
- Java, C++, Go (Judge0 supports, enabled after security review)

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
- Open-source allows customization and auditing

### More Difficult

- Infrastructure complexity (Kubernetes, queue integration)
- Must maintain Judge0 and container images
- Performance tuning for cold starts
- Cost of dedicated execution infrastructure
- Sophisticated abuse detection needed

## Review Date

2027-02-17 (6 months) - Review security incidents, performance metrics, abuse patterns, and cost per execution

## Owners

- Security Lead: Sandbox hardening and security review
- DevOps Lead: Infrastructure and monitoring
- Backend Lead: Queue integration and quota enforcement

# ADR-008: Telemetry and Observability

## Status

Accepted

## Context

Production systems require comprehensive observability for debugging, performance optimization, incident response, and capacity planning. We need to instrument the application with logging, metrics, tracing, and alerting while protecting user privacy.

## Decision

### Observability Stack

**OpenTelemetry + AWS CloudWatch (or DataDog for richer features)**

Components:
1. **Logs:** Structured JSON logs via OpenTelemetry
2. **Metrics:** OpenTelemetry Metrics (RED and USE patterns)
3. **Traces:** Distributed tracing for request flows
4. **Alerts:** CloudWatch Alarms or DataDog monitors

Rationale:
- OpenTelemetry is vendor-neutral (can switch backends)
- Native integration with AWS services
- Structured logs enable powerful querying
- Distributed tracing critical for async workflows

### Instrumentation Strategy

#### Logs

**Structured JSON with redaction**

```json
{
  "timestamp": "2026-08-17T10:30:00Z",
  "level": "INFO",
  "service": "api",
  "traceId": "abc123",
  "spanId": "def456",
  "userId": "hashed-uuid",
  "action": "evaluate_pseudocode",
  "duration_ms": 234,
  "status": "success"
}
```

**Privacy Requirements:**
- **Never log:** Email, name, full pseudocode content, code submissions
- **Hash user IDs:** One-way hash for log correlation (rotate hash key quarterly)
- **Redact by default:** Explicit allowlist for loggable fields
- **Retention:** 30 days for debugging, then deleted

**Log Levels:**
- **DEBUG:** Development only, never in production
- **INFO:** Request/response, state changes, business events
- **WARN:** Retryable errors, degraded performance, quota warnings
- **ERROR:** Failures requiring attention, with stack traces

#### Metrics

**Key Metrics (RED + USE):**

Rate, Error, Duration:
- `api.requests.rate` - Requests per second by endpoint
- `api.requests.errors` - Error rate by status code
- `api.requests.duration` - p50/p95/p99 latency

Utilization, Saturation, Errors:
- `postgres.connections.active` - Database connection usage
- `queue.depth` - Messages waiting processing
- `worker.cpu.utilization` - Worker resource usage

Business Metrics:
- `evaluations.completed` - Successful evaluations
- `evaluations.ai.duration` - AI evaluation latency
- `sandbox.executions.rate` - Code execution volume
- `users.signups.rate` - New user registrations

#### Traces

**Distributed tracing for critical flows:**

1. User submits pseudocode → API → Queue → Worker → AI → Database
2. User executes code → API → Queue → Worker → Sandbox → Database
3. User requests data export → API → Queue → Worker → S3

Trace Context:
- Propagate W3C Trace Context headers
- Include user ID (hashed), session ID, feature flags
- Sample 100% of errors, 10% of successful requests in production

### Correlation IDs

Every request generates a UUID correlation ID:
- Returned in `X-Request-ID` header
- Included in all logs and traces
- Displayed to user for support requests
- Enables full request reconstruction

### Alerting Strategy

**Critical Alerts (PagerDuty escalation):**
- API error rate >5% for >5 minutes
- Database CPU >90% for >5 minutes
- Queue depth >1000 messages aged >10 minutes
- Evaluation service down
- Security event (failed auth attempts >100/min)

**Warning Alerts (Slack notification):**
- API p95 latency >2s
- Worker pool health check failures
- Daily budget exceeded by 20%
- Certificate expiry <30 days

### Dashboards

**Core Dashboards:**
1. **Overview:** Traffic, errors, latency (SLIs/SLOs)
2. **Evaluation:** Queue depth, processing time, AI latency, rubric pass rate
3. **Sandbox:** Execution count, timeout rate, quota usage
4. **Infrastructure:** CPU, memory, disk, network by service
5. **Business:** Signups, active users, attempts, completions

### Error Tracking

**Sentry or AWS X-Ray for error aggregation**

- Automatically capture unhandled exceptions
- Group similar errors for triage
- Link errors to traces and logs
- User impact analysis (how many users affected)
- Release tracking to identify regression

### Performance Monitoring

**Web Vitals for frontend:**
- Largest Contentful Paint (LCP) <2.5s
- First Input Delay (FID) <100ms
- Cumulative Layout Shift (CLS) <0.1

**Backend:**
- API p95 latency <500ms
- Database query p95 <100ms
- Cache hit rate >80%

### Runbooks

Every alert must link to a runbook with:
- Symptom description
- Impact severity
- Investigation steps
- Common causes
- Mitigation actions
- Escalation contacts

## Consequences

### Easier

- Rapid incident diagnosis with correlated logs/traces
- Proactive alerting before user impact
- Data-driven performance optimization
- Capacity planning based on trends
- Clear SLI/SLO tracking

### More Difficult

- Instrumentation overhead (latency, cost)
- Alert tuning to reduce noise
- Privacy compliance requires redaction discipline
- Storage costs for logs and traces
- Team must learn query languages (CloudWatch Insights, DataDog)

## Review Date

2027-02-17 (6 months) - Review alert noise, dashboard usage, log costs, and coverage gaps

## Owners

- DevOps Lead: Observability stack setup and alert tuning
- Backend Lead: Application instrumentation
- Security Lead: Privacy review of logged data

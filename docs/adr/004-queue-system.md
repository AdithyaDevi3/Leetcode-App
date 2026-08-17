# ADR-004: Queue System

## Status

Accepted

## Context

Evaluation and notification processing must be asynchronous to provide responsive user experience. AI evaluation may take 3-10 seconds, and code execution must be isolated from web processes. We need a reliable queue for background job processing.

## Decision

### Queue System

**AWS SQS, Google Cloud Tasks, or Azure Queue Storage with dead-letter queues**

Rationale:
- Managed service reduces operational burden
- Built-in retry, visibility timeout, and dead-letter handling
- Scales automatically with demand
- Cost-effective for our expected volume (<1M messages/month initially)
- Native integration with cloud provider monitoring

### Queue Architecture

```
┌─────────────┐
│  API Server │
└──────┬──────┘
       │ (enqueue)
       ▼
┌─────────────────┐      ┌──────────────┐
│ Evaluation Queue├─────▶│ Worker Pool  │
└─────────────────┘      └──────┬───────┘
       │                         │
       │ (failed)                │ (success)
       ▼                         ▼
┌─────────────────┐      ┌──────────────┐
│ Dead Letter Q   │      │  Database    │
└─────────────────┘      └──────────────┘
```

### Queue Types

1. **evaluation-queue** - Pseudocode and AI evaluation jobs
2. **execution-queue** - Code sandbox execution jobs
3. **notification-queue** - Email, push, and reminder jobs
4. **export-queue** - User data export and deletion jobs

### Job Design Principles

- **Idempotent:** Jobs can be retried safely
- **Timeout Bounded:** Every job has maximum execution time
- **Failure Recoverable:** Failed jobs go to DLQ for manual review
- **Self-Contained:** Job payload includes all required data
- **Versioned:** Job schema versions enable safe worker updates

### Retry Policy

- **Max Retries:** 3 attempts
- **Backoff:** Exponential with jitter (1s, 4s, 16s)
- **Visibility Timeout:** 300s (5 minutes) for evaluation, 120s for execution
- **DLQ Processing:** Manual review + automated alerts for DLQ depth >10

### Monitoring and Alerting

- **Queue Depth:** Alert if >100 messages aged >5 minutes
- **Processing Time:** p95/p99 latency per queue type
- **DLQ Rate:** Alert if >5% of messages end in DLQ
- **Worker Health:** Heartbeat monitoring for worker pool

## Consequences

### Easier

- Responsive API even during slow AI calls
- Horizontal scaling of worker capacity
- Failure isolation and retry handling
- Cost optimization through async processing

### More Difficult

- Added complexity of distributed system
- Debugging requires correlation IDs and distributed tracing
- Workers need robust error handling and observability
- DLQ investigation requires dedicated oncall procedures

## Review Date

2027-02-17 (6 months) - Review queue metrics and DLQ patterns, tune retry policies

## Owners

- Backend Lead: Queue integration and job design
- DevOps Lead: Worker infrastructure and monitoring

# @leetcode-app/observability

OpenTelemetry instrumentation and structured logging package for Leetcode App.

## Features

- **Distributed Tracing:** OpenTelemetry SDK with auto-instrumentation
- **Structured Logging:** Pino-based logger with correlation IDs
- **Metrics Collection:** Application and business metrics
- **Context Propagation:** Automatic trace context propagation
- **Environment-aware:** Different configs for dev, staging, production

## Installation

This package is part of the monorepo workspace:

```bash
npm install
```

## Usage

### Initialize Observability

At the entry point of your application:

```typescript
import { initObservability } from '@leetcode-app/observability';

// Initialize before any other imports
initObservability({
  serviceName: 'leetcode-web',
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});
```

### Structured Logging

```typescript
import { logger } from '@leetcode-app/observability/logger';

// Basic logging
logger.info('User logged in', { userId: '123', method: 'oauth' });
logger.warn('Rate limit approaching', { userId: '123', remaining: 10 });
logger.error('Database connection failed', { error: err.message });

// With correlation ID (auto-attached from trace context)
logger.info('Processing evaluation', { submissionId: 'abc' });
```

### Custom Tracing

```typescript
import { trace, SpanStatusCode } from '@leetcode-app/observability/tracing';

const tracer = trace.getTracer('leetcode-evaluator');

async function evaluateSubmission(submissionId: string) {
  const span = tracer.startSpan('evaluate-submission');
  span.setAttribute('submission.id', submissionId);
  
  try {
    // Your logic here
    const result = await runTests(submissionId);
    span.setAttribute('submission.passed', result.passed);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

### Metrics

```typescript
import { createCounter, createHistogram } from '@leetcode-app/observability/metrics';

// Counter for events
const submissionsCounter = createCounter('submissions_total', {
  description: 'Total number of code submissions',
});

submissionsCounter.add(1, { language: 'python', status: 'success' });

// Histogram for durations
const evaluationDuration = createHistogram('evaluation_duration_ms', {
  description: 'Code evaluation duration in milliseconds',
  unit: 'ms',
});

const startTime = Date.now();
await evaluateCode();
evaluationDuration.record(Date.now() - startTime, { language: 'python' });
```

## Configuration

### Environment Variables

- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry collector endpoint (e.g., `http://localhost:4318`)
- `OTEL_SERVICE_NAME` - Service name (defaults to package name)
- `LOG_LEVEL` - Logging level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`)
- `LOG_PRETTY` - Enable pretty-printing for development (`true`/`false`)

### Example (.env)

```bash
# Development
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=debug
LOG_PRETTY=true

# Production
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
LOG_LEVEL=info
LOG_PRETTY=false
```

## Auto-Instrumentation

The following libraries are automatically instrumented:

- **HTTP/HTTPS:** Incoming and outgoing requests
- **Express/Fastify:** Route handlers and middleware
- **PostgreSQL:** Database queries via `pg` driver
- **Redis:** Cache operations via `ioredis`
- **AWS SDK:** S3, SQS, and other AWS service calls

## Log Format

### Development (Pretty)

```
[14:32:15.123] INFO (leetcode-web/1234): User logged in
    userId: "123"
    method: "oauth"
    traceId: "abc123def456"
```

### Production (JSON)

```json
{
  "level": 30,
  "time": 1699876335123,
  "pid": 1234,
  "hostname": "web-pod-abc",
  "service": "leetcode-web",
  "traceId": "abc123def456",
  "spanId": "def456ghi789",
  "userId": "123",
  "method": "oauth",
  "msg": "User logged in"
}
```

## Sensitive Data Handling

The logger automatically redacts sensitive fields:

- `password`, `token`, `apiKey`, `secret`
- `authorization` headers
- Credit card numbers (via regex)

Example:

```typescript
logger.info('User authenticated', {
  username: 'alice',
  password: 'super-secret',  // Automatically redacted
});

// Output: { username: 'alice', password: '[REDACTED]' }
```

## Correlation IDs

Trace IDs are automatically propagated:

1. Incoming HTTP requests extract trace context from headers
2. Logger includes `traceId` and `spanId` in every log
3. Outgoing HTTP requests include trace context headers

This enables end-to-end request tracing across services.

## Performance

- **Sampling:** 10% in production, 100% in dev (configurable)
- **Async Export:** Traces/metrics exported asynchronously
- **Batching:** Telemetry batched before sending
- **Minimal Overhead:** <5% CPU overhead in production

## Testing

```bash
npm test
```

Mock the observability SDK in tests:

```typescript
import { vi } from 'vitest';

vi.mock('@leetcode-app/observability', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  initObservability: vi.fn(),
}));
```

## Integration with CloudWatch

For AWS CloudWatch Logs:

1. Configure OpenTelemetry Collector to export to CloudWatch
2. Use AWS Distro for OpenTelemetry (ADOT) in ECS tasks
3. Logs automatically include X-Ray trace IDs

## Troubleshooting

### Traces not appearing

- Check `OTEL_EXPORTER_OTLP_ENDPOINT` is reachable
- Verify OpenTelemetry collector is running
- Check sampling rate (increase in dev)

### Logs missing trace IDs

- Ensure `initObservability()` is called before app starts
- Verify auto-instrumentation is loaded

### High memory usage

- Reduce batch size in OTLP exporter
- Increase export interval
- Lower sampling rate

## Resources

- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Pino Documentation](https://getpino.io/)
- [AWS X-Ray](https://aws.amazon.com/xray/)
- [ADR-008: Telemetry](../../docs/adr/008-telemetry-and-observability.md)

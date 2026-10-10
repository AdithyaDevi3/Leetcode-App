import pino from 'pino';
import { isSpanContextValid, trace } from '@opentelemetry/api';

// Sensitive fields to redact
const REDACTED_FIELDS = [
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'cookie',
  'accessToken',
  'refreshToken',
];

export function activeTraceContext() {
  const span = trace.getActiveSpan();
  if (!span) return {};

  const spanContext = span.spanContext();
  if (!isSpanContextValid(spanContext)) return {};

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Pretty print in development
  transport:
    process.env.LOG_PRETTY === 'true'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  // Redact sensitive fields
  redact: {
    paths: REDACTED_FIELDS,
    remove: false,
  },
  // Base fields
  base: {
    service: process.env.OTEL_SERVICE_NAME || 'leetcode-app',
    environment: process.env.NODE_ENV || 'development',
  },
  // Mixin to add trace context
  mixin: activeTraceContext,
});

export default logger;

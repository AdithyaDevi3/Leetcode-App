import { initObservability } from '@leetcode-app/observability';
import { logger } from '@leetcode-app/observability/logger';

export function registerNodeObservability() {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!otlpEndpoint) return;

  initObservability({
    serviceName: 'leetcode-app-web',
    serviceVersion: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    otlpEndpoint,
  });
}

export function reportServerError(fields: Record<string, unknown>) {
  logger.error(fields, 'Unhandled Next.js server error');
}

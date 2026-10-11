#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const healthProbes = [
  { path: '/api/health', service: 'method-web', statuses: ['ok'] },
  { path: '/api/health/ready', service: null, statuses: ['ready'] },
  { path: '/api/health/evaluations', service: 'evaluation-queue', statuses: ['ok'] },
  { path: '/api/health/executions', service: 'execution-queue', statuses: ['ok', 'disabled'] },
  { path: '/api/health/verifications', service: 'gradebook-verification-queue', statuses: ['ok', 'disabled'] },
];

export function validateProductionTarget(rawUrl, expectedHost) {
  if (!rawUrl || !expectedHost) {
    throw new Error('PRODUCTION_APP_URL and PRODUCTION_APP_HOST must be configured');
  }

  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('Production health target must use HTTPS');
  if (url.username || url.password) throw new Error('Production health target must not contain credentials');
  if (url.hostname !== expectedHost) throw new Error('Production health target does not match PRODUCTION_APP_HOST');
  if (url.port || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Production health target must be an origin without port, path, query, or fragment');
  }
  return url.origin;
}

export async function checkProductionHealth({ rawUrl, expectedHost, fetchImpl = fetch, timeoutMs = 10_000 }) {
  const origin = validateProductionTarget(rawUrl, expectedHost);
  const results = [];

  for (const probe of healthProbes) {
    let response;
    try {
      response = await fetchImpl(`${origin}${probe.path}`, {
        headers: { accept: 'application/json', 'user-agent': 'method-production-health-monitor' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown network error';
      throw new Error(`${probe.path} request failed: ${reason}`);
    }
    if (!response.ok) throw new Error(`${probe.path} returned HTTP ${response.status}`);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`${probe.path} returned malformed JSON`);
    }
    if (!payload || typeof payload !== 'object' || !probe.statuses.includes(payload.status)) {
      throw new Error(`${probe.path} returned unexpected status`);
    }
    if (probe.service && payload.service !== probe.service) {
      throw new Error(`${probe.path} returned unexpected service identity`);
    }
    results.push({ path: probe.path, status: payload.status });
  }

  return results;
}

async function main() {
  const results = await checkProductionHealth({
    rawUrl: process.env.PRODUCTION_APP_URL,
    expectedHost: process.env.PRODUCTION_APP_HOST,
  });
  for (const result of results) process.stdout.write(`${result.path}: ${result.status}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Production health check failed'}\n`);
    process.exitCode = 1;
  });
}

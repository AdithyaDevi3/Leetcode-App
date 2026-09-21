import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const serviceWorkerPath = fileURLToPath(
  new URL('../../public/sw.js', import.meta.url),
);
const offlineFallbackPath = fileURLToPath(
  new URL('../../public/offline.html', import.meta.url),
);

describe('offline service-worker assets', () => {
  it('falls back to a build-independent static document', () => {
    const serviceWorker = readFileSync(serviceWorkerPath, 'utf8');

    expect(serviceWorker).toContain("const OFFLINE_URL = '/offline.html'");
    expect(serviceWorker).not.toContain("const SHELL = ['/', '/offline']");
    expect(serviceWorker).toContain("const LEGACY_CACHE_PREFIX = 'method-shell-'");
  });

  it('does not depend on deployment-specific Next.js assets', () => {
    const offlineFallback = readFileSync(offlineFallbackPath, 'utf8');

    expect(offlineFallback).not.toMatch(/\/_next\//);
    expect(offlineFallback).not.toMatch(/<script[^>]+src=/i);
    expect(offlineFallback).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
  });
});

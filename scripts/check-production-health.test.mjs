import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkProductionHealth, healthProbes, validateProductionTarget } from './check-production-health.mjs';

describe('production health target validation', () => {
  it('accepts only the configured HTTPS origin', () => {
    assert.equal(
      validateProductionTarget('https://app.example.com', 'app.example.com'),
      'https://app.example.com',
    );
    assert.throws(() => validateProductionTarget('http://app.example.com', 'app.example.com'), /HTTPS/);
    assert.throws(() => validateProductionTarget('https://preview.example.com', 'app.example.com'), /does not match/);
    const credentialedTarget = new URL('https://app.example.com');
    credentialedTarget.username = 'credential-placeholder';
    assert.throws(() => validateProductionTarget(credentialedTarget.href, 'app.example.com'), /credentials/);
    assert.throws(() => validateProductionTarget('https://app.example.com/path', 'app.example.com'), /origin/);
  });
});

describe('production health contract', () => {
  it('accepts healthy queues and intentionally disabled execution features', async () => {
    const responses = new Map(healthProbes.map((probe) => [probe.path, {
      status: probe.path === '/api/health/ready' ? 'ready'
        : probe.path.includes('executions') || probe.path.includes('verifications') ? 'disabled' : 'ok',
      ...(probe.service ? { service: probe.service } : {}),
    }]));
    const fetchImpl = async (url) => {
      const payload = responses.get(new URL(url).pathname);
      return new Response(JSON.stringify(payload), { status: 200 });
    };

    const results = await checkProductionHealth({
      rawUrl: 'https://app.example.com',
      expectedHost: 'app.example.com',
      fetchImpl,
    });
    assert.equal(results.length, healthProbes.length);
    assert.deepEqual(results.at(-1), { path: '/api/health/verifications', status: 'disabled' });
  });

  it('fails on degraded, malformed, or misidentified responses', async () => {
    const defaults = { status: 'ok', service: 'method-web' };
    await assert.rejects(
      checkProductionHealth({
        rawUrl: 'https://app.example.com',
        expectedHost: 'app.example.com',
        fetchImpl: async () => new Response(JSON.stringify({ ...defaults, status: 'degraded' })),
      }),
      /unexpected status/,
    );
    await assert.rejects(
      checkProductionHealth({
        rawUrl: 'https://app.example.com',
        expectedHost: 'app.example.com',
        fetchImpl: async () => new Response('not-json'),
      }),
      /malformed JSON/,
    );
    await assert.rejects(
      checkProductionHealth({
        rawUrl: 'https://app.example.com',
        expectedHost: 'app.example.com',
        fetchImpl: async () => new Response(JSON.stringify({ ...defaults, service: 'wrong-service' })),
      }),
      /unexpected service identity/,
    );
  });

  it('identifies the endpoint when a network request fails', async () => {
    await assert.rejects(
      checkProductionHealth({
        rawUrl: 'https://app.example.com',
        expectedHost: 'app.example.com',
        fetchImpl: async () => { throw new Error('network unavailable'); },
      }),
      /\/api\/health request failed: network unavailable/,
    );
  });
});

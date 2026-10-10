import { describe, expect, it } from 'vitest';
import { serverErrorLogFields } from './server-error-log';

describe('server error log fields', () => {
  it('captures bounded route context without query parameters', () => {
    const error = Object.assign(new Error('Database unavailable'), { digest: 'digest-123' });

    expect(serverErrorLogFields(
      error,
      { method: 'POST', path: '/api/practice?token=private' },
      {
        routerKind: 'App Router',
        routePath: '/app/api/practice/route',
        routeType: 'route',
        renderSource: 'server-rendering',
        renderType: 'dynamic',
      },
    )).toEqual({
      event: 'next.server.error',
      errorName: 'Error',
      errorMessage: 'Database unavailable',
      errorDigest: 'digest-123',
      requestMethod: 'POST',
      requestPath: '/api/practice',
      routerKind: 'App Router',
      routePath: '/app/api/practice/route',
      routeType: 'route',
      renderSource: 'server-rendering',
      renderType: 'dynamic',
    });
  });

  it('omits optional fields and truncates oversized messages', () => {
    const fields = serverErrorLogFields(
      new Error('x'.repeat(1_100)),
      { method: 'GET', path: '/practice' },
      { routerKind: 'App Router', routePath: '/app/practice/page', routeType: 'render' },
    );

    expect(fields.errorMessage).toHaveLength(1_000);
    expect(fields).not.toHaveProperty('errorDigest');
    expect(fields).not.toHaveProperty('renderSource');
  });

  it('handles non-Error throws without serializing their value', () => {
    const fields = serverErrorLogFields(
      { learnerInput: 'sensitive value' },
      { method: 'GET', path: '/practice' },
      { routerKind: 'App Router', routePath: '/app/practice/page', routeType: 'render' },
    );

    expect(fields.errorName).toBe('UnknownError');
    expect(fields.errorMessage).toBe('A non-Error value was thrown');
    expect(JSON.stringify(fields)).not.toContain('sensitive value');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { clearRateLimitsForTests, createPostgresRateLimiter, takeMemoryRateLimit } from './rate-limit';

describe('in-process rate limit', () => {
  afterEach(clearRateLimitsForTests);

  it('limits a key until its window expires', () => {
    expect(takeMemoryRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 10 })).toEqual({ allowed: true });
    expect(takeMemoryRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 20 })).toEqual({ allowed: true });
    expect(takeMemoryRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 200 })).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(takeMemoryRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 1_010 })).toEqual({ allowed: true });
  });

  it('keeps identities isolated', () => {
    takeMemoryRateLimit('user-1', { limit: 1, windowMs: 1_000, now: 10 });
    expect(takeMemoryRateLimit('user-2', { limit: 1, windowMs: 1_000, now: 10 })).toEqual({ allowed: true });
  });

  it('uses an atomic PostgreSQL counter and never sends the raw identity', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ request_count: 1, retry_after_seconds: 60 }] })
      .mockResolvedValueOnce({ rows: [{ request_count: 3, retry_after_seconds: 42 }] });
    const take = createPostgresRateLimiter({ query } as never);

    await expect(take('evaluation:sensitive-user-id', { limit: 2, windowMs: 60_000 })).resolves.toEqual({ allowed: true });
    await expect(take('evaluation:sensitive-user-id', { limit: 2, windowMs: 60_000 })).resolves.toEqual({ allowed: false, retryAfterSeconds: 42 });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("window_ends_at < clock_timestamp() - INTERVAL '1 day'");
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (bucket_hash, window_started_at)');
    expect(query.mock.calls[0][1][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(query.mock.calls[0][1]).not.toContain('evaluation:sensitive-user-id');
  });

  it('rejects unsafe counter configuration before querying PostgreSQL', async () => {
    const query = vi.fn();
    const take = createPostgresRateLimiter({ query } as never);
    await expect(take('key', { limit: 0, windowMs: 1_000 })).rejects.toThrow('limit must be a positive integer');
    expect(query).not.toHaveBeenCalled();
  });
});

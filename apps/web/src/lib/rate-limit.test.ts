import { afterEach, describe, expect, it } from 'vitest';
import { clearRateLimitsForTests, takeRateLimit } from './rate-limit';

describe('in-process rate limit', () => {
  afterEach(clearRateLimitsForTests);

  it('limits a key until its window expires', () => {
    expect(takeRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 10 })).toEqual({ allowed: true });
    expect(takeRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 20 })).toEqual({ allowed: true });
    expect(takeRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 200 })).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(takeRateLimit('user-1', { limit: 2, windowMs: 1_000, now: 1_010 })).toEqual({ allowed: true });
  });

  it('keeps identities isolated', () => {
    takeRateLimit('user-1', { limit: 1, windowMs: 1_000, now: 10 });
    expect(takeRateLimit('user-2', { limit: 1, windowMs: 1_000, now: 10 })).toEqual({ allowed: true });
  });
});

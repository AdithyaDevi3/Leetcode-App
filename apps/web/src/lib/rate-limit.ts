type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function takeRateLimit(
  key: string,
  { limit, windowMs, now = Date.now() }: { limit: number; windowMs: number; now?: number },
): RateLimitResult {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true };
}

export function clearRateLimitsForTests() {
  buckets.clear();
}

import { createHash } from 'node:crypto';
import { createDatabaseClient, databaseConfigFromEnv, type DatabaseClient } from '@leetcode-app/database';

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };
export type RateLimitOptions = { limit: number; windowMs: number; now?: number };

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function takeMemoryRateLimit(
  key: string,
  { limit, windowMs, now = Date.now() }: RateLimitOptions,
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

type CounterRow = { request_count: number | string; retry_after_seconds: number | string };

export function createPostgresRateLimiter(db: DatabaseClient) {
  return async (key: string, options: RateLimitOptions): Promise<RateLimitResult> => {
    const limit = positiveInteger(options.limit, 'limit');
    const windowMs = positiveInteger(options.windowMs, 'windowMs');
    const bucketHash = createHash('sha256')
      .update(`${key}\0${limit}\0${windowMs}`)
      .digest('hex');
    const result = await db.query<CounterRow>(
      `WITH expired AS (
         DELETE FROM rate_limit_counters WHERE window_ends_at < clock_timestamp() - INTERVAL '1 day'
       ), current_window AS (
         SELECT date_bin($2 * INTERVAL '1 millisecond', clock_timestamp(), TIMESTAMPTZ '1970-01-01') AS started_at
       )
       INSERT INTO rate_limit_counters (bucket_hash, window_started_at, window_ends_at, request_count)
       SELECT $1, started_at, started_at + ($2 * INTERVAL '1 millisecond'), 1
       FROM current_window
       ON CONFLICT (bucket_hash, window_started_at)
       DO UPDATE SET request_count = rate_limit_counters.request_count + 1
       RETURNING request_count,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_ends_at - clock_timestamp())))) AS retry_after_seconds`,
      [bucketHash, windowMs],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Rate limit counter did not return a result');
    return Number(row.request_count) <= limit
      ? { allowed: true }
      : { allowed: false, retryAfterSeconds: Number(row.retry_after_seconds) };
  };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

let postgresLimiter: ReturnType<typeof createPostgresRateLimiter> | undefined;

export async function takeRateLimit(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_STORE !== 'postgres') return takeMemoryRateLimit(key, options);
  postgresLimiter ??= createPostgresRateLimiter(createDatabaseClient(databaseConfigFromEnv()));
  return postgresLimiter(key, options);
}

export function clearRateLimitsForTests() {
  buckets.clear();
  postgresLimiter = undefined;
}

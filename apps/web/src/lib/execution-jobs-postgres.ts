import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';
import type { ExecutionRequest, ExecutionResult, ExecutionStatus } from '@leetcode-app/domain';

export type ExecutionJob = { id: string; userId: string; sessionId: string; request: ExecutionRequest; status: ExecutionStatus; result: ExecutionResult | null; error: string | null; attempts: number; maxAttempts: number; queuedAt: string; startedAt: string | null; completedAt: string | null };
export type ExecutionQueueMetrics = { queued: number; running: number; completed: number; failed: number; canceled: number; timedOut: number; oldestQueuedAgeMs: number };
type Row = { id: string; user_id: string; session_id: string; language: ExecutionRequest['language']; source: string; stdin: string; limits: ExecutionRequest['limits']; status: ExecutionStatus; result: ExecutionResult | null; error: string | null; attempts: number; max_attempts: number; queued_at: Date | string; started_at: Date | string | null; completed_at: Date | string | null };
const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();
const mapJob = (row: Row): ExecutionJob => ({ id: row.id, userId: row.user_id, sessionId: row.session_id, request: { language: row.language, source: row.source, stdin: row.stdin, limits: row.limits }, status: row.status, result: row.result, error: row.error, attempts: row.attempts, maxAttempts: row.max_attempts, queuedAt: iso(row.queued_at)!, startedAt: iso(row.started_at), completedAt: iso(row.completed_at) });

export function createExecutionJobStore(db: DatabaseClient = createDatabaseClient({ host: process.env.POSTGRES_HOST ?? 'localhost', port: Number(process.env.POSTGRES_PORT ?? 5432), database: process.env.POSTGRES_DB ?? 'leetcode_app', user: process.env.POSTGRES_USER ?? 'postgres', password: process.env.POSTGRES_PASSWORD ?? 'postgres' })) {
  return {
    async enqueue(input: { userId: string; sessionId: string; request: ExecutionRequest }): Promise<ExecutionJob> {
      const result = await db.query<Row>(`INSERT INTO execution_jobs (user_id, session_id, language, source, stdin, limits) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [input.userId, input.sessionId, input.request.language, input.request.source, input.request.stdin ?? '', JSON.stringify(input.request.limits)]);
      return mapJob(result.rows[0]);
    },
    async findOwned(id: string, userId: string, sessionId: string): Promise<ExecutionJob | null> {
      const result = await db.query<Row>('SELECT * FROM execution_jobs WHERE id = $1 AND user_id = $2 AND session_id = $3', [id, userId, sessionId]);
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },
    async claimNext(): Promise<ExecutionJob | null> {
      return db.transaction(async (client) => {
        const result = await client.query<Row>(`UPDATE execution_jobs SET status = 'running', started_at = NOW(), attempts = attempts + 1 WHERE id = (SELECT id FROM execution_jobs WHERE status = 'queued' ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
        return result.rows[0] ? mapJob(result.rows[0]) : null;
      });
    },
    async failStaleRunning(staleAfterMs: number): Promise<number> {
      const result = await db.query<{ id: string }>(
        `UPDATE execution_jobs
         SET status = 'failed', completed_at = NOW(),
             error = COALESCE(error, 'Worker lease expired; execution outcome is unknown')
         WHERE status = 'running' AND started_at < NOW() - ($1 * INTERVAL '1 millisecond')
         RETURNING id`,
        [Math.max(1, Math.floor(staleAfterMs))],
      );
      return result.rows.length;
    },
    async complete(id: string, result: ExecutionResult): Promise<void> {
      await db.query(`UPDATE execution_jobs SET status = $2, result = $3, completed_at = NOW(), error = NULL WHERE id = $1 AND status = 'running'`, [id, result.status, JSON.stringify(result)]);
    },
    async fail(id: string, error: string): Promise<void> {
      await db.query(`UPDATE execution_jobs SET status = 'failed', error = $2, completed_at = NOW() WHERE id = $1 AND status = 'running'`, [id, error]);
    },
    async cancel(id: string, userId: string, sessionId: string): Promise<ExecutionJob | null> {
      const result = await db.query<Row>(`UPDATE execution_jobs SET status = 'canceled', completed_at = NOW() WHERE id = $1 AND user_id = $2 AND session_id = $3 AND status IN ('queued', 'running') RETURNING *`, [id, userId, sessionId]);
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },
    async metrics(): Promise<ExecutionQueueMetrics> {
      const result = await db.query<{ queued: string; running: string; completed: string; failed: string; canceled: string; timed_out: string; oldest_queued_age_ms: string | null }>(
        `SELECT COUNT(*) FILTER (WHERE status = 'queued') AS queued,
                COUNT(*) FILTER (WHERE status = 'running') AS running,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed,
                COUNT(*) FILTER (WHERE status = 'canceled') AS canceled,
                COUNT(*) FILTER (WHERE status = 'timed_out') AS timed_out,
                EXTRACT(EPOCH FROM (NOW() - MIN(queued_at) FILTER (WHERE status = 'queued'))) * 1000 AS oldest_queued_age_ms
         FROM execution_jobs`,
      );
      const row = result.rows[0];
      return { queued: Number(row.queued), running: Number(row.running), completed: Number(row.completed), failed: Number(row.failed), canceled: Number(row.canceled), timedOut: Number(row.timed_out), oldestQueuedAgeMs: Number(row.oldest_queued_age_ms ?? 0) };
    },
  };
}

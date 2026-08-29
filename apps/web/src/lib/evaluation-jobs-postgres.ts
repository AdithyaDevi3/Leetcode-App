import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';
import type { EvaluationJob, EvaluationJobRequest } from './evaluation-jobs';

type JobRow = {
  id: string; user_id: string; session_id: string; revision_number: number; evaluator_version: string; rubric_version: string;
  status: EvaluationJob['status']; attempts: number; max_attempts: number; result: unknown; error: string | null;
  queued_at: Date | string; started_at: Date | string | null; completed_at: Date | string | null; dead_lettered_at: Date | string | null;
};
export type EvaluationQueueMetrics = { queued: number; running: number; completed: number; failed: number; canceled: number; deadLettered: number; oldestQueuedAgeMs: number };
const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();
const mapJob = (row: JobRow): EvaluationJob => ({
  id: row.id, userId: row.user_id, sessionId: row.session_id, revisionNumber: row.revision_number,
  evaluatorVersion: row.evaluator_version, rubricVersion: row.rubric_version, status: row.status,
  queuePosition: 0, queuedAt: iso(row.queued_at)!, startedAt: iso(row.started_at), completedAt: iso(row.completed_at),
  result: row.result, error: row.error, attempts: row.attempts, maxAttempts: row.max_attempts, deadLetteredAt: iso(row.dead_lettered_at),
});

export function createEvaluationJobStore(db: DatabaseClient = createDatabaseClient({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'leetcode_app',
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
})) {
  return {
    async enqueue(request: EvaluationJobRequest): Promise<EvaluationJob> {
      const result = await db.query<JobRow>(
        `INSERT INTO evaluation_jobs (user_id, session_id, revision_number, evaluator_version, rubric_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, session_id, revision_number, evaluator_version, rubric_version)
         DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING *`,
        [request.userId, request.sessionId, request.revisionNumber, request.evaluatorVersion ?? 'v1', request.rubricVersion ?? 'rubric-v1'],
      );
      return mapJob(result.rows[0]);
    },
    async findOwned(jobId: string, userId: string, sessionId: string): Promise<EvaluationJob | null> {
      const result = await db.query<JobRow>('SELECT * FROM evaluation_jobs WHERE id = $1 AND user_id = $2 AND session_id = $3', [jobId, userId, sessionId]);
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },
    async findById(jobId: string): Promise<EvaluationJob | null> {
      const result = await db.query<JobRow>('SELECT * FROM evaluation_jobs WHERE id = $1', [jobId]);
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },
    async claimNext(): Promise<EvaluationJob | null> {
      return db.transaction(async (client) => {
        const result = await client.query<JobRow>(
          `UPDATE evaluation_jobs SET status = 'running', started_at = NOW(), attempts = attempts + 1
           WHERE id = (SELECT id FROM evaluation_jobs WHERE status = 'queued' ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING *`,
        );
        return result.rows[0] ? mapJob(result.rows[0]) : null;
      });
    },
    async complete(jobId: string, result: unknown): Promise<void> {
      await db.query(`UPDATE evaluation_jobs SET status = 'completed', result = $2, completed_at = NOW(), error = NULL WHERE id = $1 AND status = 'running'`, [jobId, JSON.stringify(result)]);
    },
    async fail(jobId: string, error: string): Promise<void> {
      await db.query(`UPDATE evaluation_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END, error = $2, completed_at = CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END, dead_lettered_at = CASE WHEN attempts >= max_attempts THEN NOW() ELSE NULL END WHERE id = $1 AND status = 'running'`, [jobId, error]);
    },
    async cancel(jobId: string, userId: string, sessionId: string): Promise<EvaluationJob | null> {
      const result = await db.query<JobRow>(`UPDATE evaluation_jobs SET status = 'canceled', completed_at = NOW() WHERE id = $1 AND user_id = $2 AND session_id = $3 AND status IN ('queued', 'running') RETURNING *`, [jobId, userId, sessionId]);
      return result.rows[0] ? mapJob(result.rows[0]) : null;
    },
    async metrics(): Promise<EvaluationQueueMetrics> {
      const result = await db.query<{
        queued: string; running: string; completed: string; failed: string; canceled: string; dead_lettered: string; oldest_queued_age_ms: string | null;
      }>(`SELECT
          COUNT(*) FILTER (WHERE status = 'queued') AS queued,
          COUNT(*) FILTER (WHERE status = 'running') AS running,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed,
          COUNT(*) FILTER (WHERE status = 'canceled') AS canceled,
          COUNT(*) FILTER (WHERE dead_lettered_at IS NOT NULL) AS dead_lettered,
          EXTRACT(EPOCH FROM (NOW() - MIN(queued_at) FILTER (WHERE status = 'queued'))) * 1000 AS oldest_queued_age_ms
        FROM evaluation_jobs`);
      const row = result.rows[0];
      return { queued: Number(row.queued), running: Number(row.running), completed: Number(row.completed), failed: Number(row.failed), canceled: Number(row.canceled), deadLettered: Number(row.dead_lettered), oldestQueuedAgeMs: Number(row.oldest_queued_age_ms ?? 0) };
    },
  };
}

import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';
import type { EvaluationJob, EvaluationJobRequest } from './evaluation-jobs';

type JobRow = Omit<EvaluationJob, 'id'> & { id: string };

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
      return result.rows[0];
    },
    async findOwned(jobId: string, userId: string, sessionId: string): Promise<EvaluationJob | null> {
      const result = await db.query<JobRow>('SELECT * FROM evaluation_jobs WHERE id = $1 AND user_id = $2 AND session_id = $3', [jobId, userId, sessionId]);
      return result.rows[0] ?? null;
    },
    async findById(jobId: string): Promise<EvaluationJob | null> {
      const result = await db.query<JobRow>('SELECT * FROM evaluation_jobs WHERE id = $1', [jobId]);
      return result.rows[0] ?? null;
    },
    async claimNext(): Promise<EvaluationJob | null> {
      return db.transaction(async (client) => {
        const result = await client.query<JobRow>(
          `UPDATE evaluation_jobs SET status = 'running', started_at = NOW(), attempts = attempts + 1
           WHERE id = (SELECT id FROM evaluation_jobs WHERE status = 'queued' ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING *`,
        );
        return result.rows[0] ?? null;
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
      return result.rows[0] ?? null;
    },
  };
}

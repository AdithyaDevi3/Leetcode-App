import { createDatabaseClient, type DatabaseClient } from '@leetcode-app/database';
import type { EvaluationAppeal } from './evaluation-appeals';

type AppealRow = {
  id: string; job_id: string; user_id: string; finding_id: string; context: string; status: EvaluationAppeal['status'];
  reviewer_id: string | null; override_approved: boolean | null; override_reason: string | null;
  created_at: Date | string; resolved_at: Date | string | null;
};
const iso = (value: Date | string | null) => value === null ? null : new Date(value).toISOString();
const mapAppeal = (row: AppealRow): EvaluationAppeal => ({
  id: row.id, jobId: row.job_id, userId: row.user_id, findingId: row.finding_id, context: row.context, status: row.status,
  reviewerId: row.reviewer_id, overrideApproved: row.override_approved, overrideReason: row.override_reason,
  createdAt: iso(row.created_at)!, resolvedAt: iso(row.resolved_at),
});

export function createEvaluationAppealStore(db: DatabaseClient = createDatabaseClient({
  host: process.env.POSTGRES_HOST ?? 'localhost', port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'leetcode_app', user: process.env.POSTGRES_USER ?? 'postgres', password: process.env.POSTGRES_PASSWORD ?? 'postgres',
})) {
  return {
    async submit(input: Pick<EvaluationAppeal, 'jobId' | 'userId' | 'findingId' | 'context'>): Promise<EvaluationAppeal> {
      const result = await db.query<AppealRow>(`INSERT INTO evaluation_appeals (job_id, user_id, finding_id, context) VALUES ($1, $2, $3, $4) RETURNING *`, [input.jobId, input.userId, input.findingId, input.context]);
      return mapAppeal(result.rows[0]);
    },
    async listOwned(jobId: string, userId: string): Promise<EvaluationAppeal[]> {
      const result = await db.query<AppealRow>('SELECT * FROM evaluation_appeals WHERE job_id = $1 AND user_id = $2 ORDER BY created_at ASC', [jobId, userId]);
      return result.rows.map(mapAppeal);
    },
    async resolve(id: string, input: { reviewerId: string; approved: boolean; reason: string }): Promise<EvaluationAppeal | null> {
      const reason = input.reason.trim();
      if (!reason) throw new Error('Override reason is required');
      return db.transaction(async (client) => {
        const result = await client.query<AppealRow>(`UPDATE evaluation_appeals
          SET status = 'resolved', reviewer_id = $2, override_approved = $3, override_reason = $4, resolved_at = NOW()
          WHERE id = $1 AND status <> 'resolved' RETURNING *`, [id, input.reviewerId, input.approved, reason]);
        if (!result.rows[0]) return null;
        await client.query(`INSERT INTO evaluation_appeal_audit (appeal_id, actor_id, action, reason) VALUES ($1, $2, $3, $4)`, [id, input.reviewerId, input.approved ? 'appeal.approved' : 'appeal.rejected', reason]);
        return mapAppeal(result.rows[0]);
      });
    },
  };
}

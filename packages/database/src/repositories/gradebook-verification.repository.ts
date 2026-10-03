import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../client.js';

export type GradebookVerificationJob = {
  id: string; attemptId: string; language: 'python' | 'cpp' | 'typescript'; source: string;
  pinnedTests: unknown[]; verifierVersionId: string; attempts: number; maxAttempts: number; leaseToken: string;
};

type JobRow = {
  id: string; attempt_id: string; recipient_id: string; policy_id: string; language: GradebookVerificationJob['language'];
  source: string; pinned_tests: unknown[]; verifier_version_id: string; attempts: number; max_attempts: number; lease_token: string;
};

export type GradebookVerificationSummary = {
  passedTests: number;
  totalTests: number;
  durationMs: number;
};

export type GradebookVerificationQueueMetrics = {
  queued: number;
  running: number;
  completed: number;
  unavailable: number;
  superseded: number;
  expiredLeases: number;
  oldestQueuedAgeMs: number;
};

function validateSummary(value: unknown): GradebookVerificationSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid verification summary');
  const summary = value as Record<string, unknown>;
  if (Object.keys(summary).sort().join(',') !== 'durationMs,passedTests,totalTests') throw new Error('Invalid verification summary');
  const { passedTests, totalTests, durationMs } = summary;
  if (!Number.isSafeInteger(passedTests) || !Number.isSafeInteger(totalTests) || !Number.isSafeInteger(durationMs)
    || (passedTests as number) < 0 || (totalTests as number) < 1 || (passedTests as number) > (totalTests as number)
    || (totalTests as number) > 10_000 || (durationMs as number) < 0 || (durationMs as number) > 3_600_000) {
    throw new Error('Invalid verification summary');
  }
  return { passedTests: passedTests as number, totalTests: totalTests as number, durationMs: durationMs as number };
}

function validateErrorCode(value: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) throw new Error('Invalid verification error code');
  return value;
}

export class PostgresGradebookVerificationRepository {
  constructor(private readonly db: DatabaseClient) {}

  async metrics(): Promise<GradebookVerificationQueueMetrics> {
    const result = await this.db.query<{
      queued: string; running: string; completed: string; unavailable: string; superseded: string;
      expired_leases: string; oldest_queued_age_ms: string | null;
    }>(`SELECT
      COUNT(*) FILTER (WHERE status='queued') AS queued,
      COUNT(*) FILTER (WHERE status='running') AS running,
      COUNT(*) FILTER (WHERE status='completed') AS completed,
      COUNT(*) FILTER (WHERE status='unavailable') AS unavailable,
      COUNT(*) FILTER (WHERE status='superseded') AS superseded,
      COUNT(*) FILTER (WHERE status='running' AND lease_expires_at<clock_timestamp()) AS expired_leases,
      EXTRACT(EPOCH FROM (clock_timestamp()-MIN(queued_at) FILTER (WHERE status='queued'))) * 1000 AS oldest_queued_age_ms
      FROM gradebook_verification_jobs`);
    const row = result.rows[0];
    return {
      queued: Number(row.queued), running: Number(row.running), completed: Number(row.completed),
      unavailable: Number(row.unavailable), superseded: Number(row.superseded),
      expiredLeases: Number(row.expired_leases), oldestQueuedAgeMs: Number(row.oldest_queued_age_ms ?? 0),
    };
  }

  async claimNext(leaseMs = 120_000): Promise<GradebookVerificationJob | null> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 900_000) throw new Error('Invalid lease duration');
    return this.db.transaction(async client => {
      const recovered = await client.query<{ id: string; status: string }>(`WITH expired AS (
        UPDATE gradebook_verification_jobs SET
          status=CASE WHEN attempts<max_attempts THEN 'queued' ELSE 'unavailable' END,
          available_at=CASE WHEN attempts<max_attempts THEN clock_timestamp() ELSE available_at END,
          lease_token=NULL, lease_expires_at=NULL, error_code='lease-expired',
          completed_at=CASE WHEN attempts<max_attempts THEN NULL ELSE clock_timestamp() END
        WHERE status='running' AND lease_expires_at<clock_timestamp()
        RETURNING id,status
      ) SELECT id,status FROM expired`);
      for (const row of recovered.rows) {
        await client.query('INSERT INTO gradebook_verification_events(verification_job_id,status,reason) VALUES($1,$2,$3)', [row.id,row.status,'lease-expired']);
      }
      const token = randomUUID();
      const result = await client.query<JobRow>(`UPDATE gradebook_verification_jobs SET
        status='running', attempts=attempts+1, started_at=clock_timestamp(), lease_token=$1,
        lease_expires_at=clock_timestamp()+($2 * interval '1 millisecond')
        WHERE id=(SELECT id FROM gradebook_verification_jobs
          WHERE status='queued' AND available_at<=clock_timestamp() AND attempts<max_attempts
          ORDER BY available_at,queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING *`, [token, leaseMs]);
      const row = result.rows[0];
      if (!row) return null;
      await client.query(`INSERT INTO gradebook_verification_events (verification_job_id,status,reason)
        VALUES ($1,'running','worker-claimed')`, [row.id]);
      return { id: row.id, attemptId: row.attempt_id, language: row.language, source: row.source,
        pinnedTests: row.pinned_tests, verifierVersionId: row.verifier_version_id,
        attempts: row.attempts, maxAttempts: row.max_attempts, leaseToken: row.lease_token };
    });
  }

  async resolve(input: { jobId: string; leaseToken: string; outcome: 'passed' | 'failed'; summary: GradebookVerificationSummary }): Promise<string | null> {
    if (input.outcome !== 'passed' && input.outcome !== 'failed') throw new Error('Invalid verification outcome');
    const summary = validateSummary(input.summary);
    return this.db.transaction(async client => {
      const identity = await client.query<{ recipient_id: string }>('SELECT recipient_id FROM gradebook_verification_jobs WHERE id=$1', [input.jobId]);
      if (!identity.rows[0]) return null;
      await client.query('SELECT id FROM gradebook_recipients WHERE id=$1 FOR UPDATE', [identity.rows[0].recipient_id]);
      const job = await client.query<JobRow & { max_units: string }>(`SELECT j.*,(p.policy->>'maxUnits')::bigint AS max_units
        FROM gradebook_verification_jobs j JOIN gradebook_policies p ON p.id=j.policy_id
        WHERE j.id=$1 AND j.status='running' AND j.lease_token=$2 AND j.lease_expires_at>=clock_timestamp()
        FOR UPDATE OF j`, [input.jobId, input.leaseToken]);
      const row = job.rows[0];
      if (!row) return null;
      if (summary.totalTests !== row.pinned_tests.length
        || (input.outcome === 'passed' && summary.passedTests !== summary.totalTests)
        || (input.outcome === 'failed' && summary.passedTests >= summary.totalTests)) {
        throw new Error('Verification outcome does not match pinned test results');
      }
      const latest = await client.query<{ id: string }>('SELECT id FROM gradebook_attempts WHERE recipient_id=$1 ORDER BY sequence DESC LIMIT 1 FOR SHARE', [row.recipient_id]);
      if (latest.rows[0]?.id !== row.attempt_id) {
        await this.finish(client, row.id, 'superseded', summary, null, 'newer-attempt');
        return null;
      }
      const prior = await client.query<{ id: string; sequence: number }>('SELECT id,sequence FROM gradebook_grade_revisions WHERE recipient_id=$1 ORDER BY sequence DESC LIMIT 1 FOR UPDATE', [row.recipient_id]);
      const requestKey = `verification:${row.id}`;
      const existing = await client.query<{ id: string }>('SELECT id FROM gradebook_grade_revisions WHERE recipient_id=$1 AND request_key=$2', [row.recipient_id, requestKey]);
      let gradeId = existing.rows[0]?.id;
      if (!gradeId) {
        const grade = await client.query<{ id: string }>(`INSERT INTO gradebook_grade_revisions
          (recipient_id,policy_id,attempt_id,supersedes_id,sequence,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key,verification_job_id)
          VALUES ($1,$2,$3,$4,$5,'scored',$6,$7,'{}','Pinned verifier result',NULL,$8,$9) RETURNING id`,
        [row.recipient_id,row.policy_id,row.attempt_id,prior.rows[0]?.id ?? null,(prior.rows[0]?.sequence ?? 0)+1,
          input.outcome==='passed'?Number(row.max_units):0,row.verifier_version_id,requestKey,row.id]);
        gradeId = grade.rows[0].id;
      }
      await this.finish(client, row.id, 'completed', summary, null, input.outcome);
      return gradeId;
    });
  }

  async unavailable(input: { jobId: string; leaseToken: string; errorCode: string; retryDelayMs?: number }): Promise<'queued' | 'unavailable' | null> {
    const errorCode = validateErrorCode(input.errorCode);
    if (input.retryDelayMs !== undefined && (!Number.isSafeInteger(input.retryDelayMs) || input.retryDelayMs < 0)) throw new Error('Invalid retry delay');
    const delay = Math.max(0, Math.min(input.retryDelayMs ?? 5_000, 3_600_000));
    return this.db.transaction(async client => {
      const job = await client.query<JobRow>(`SELECT * FROM gradebook_verification_jobs
        WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>=clock_timestamp() FOR UPDATE`, [input.jobId,input.leaseToken]);
      const row=job.rows[0]; if(!row) return null;
      const status = row.attempts < row.max_attempts ? 'queued' : 'unavailable';
      await client.query(`UPDATE gradebook_verification_jobs SET status=$3,available_at=clock_timestamp()+($4*interval '1 millisecond'),
        lease_token=NULL,lease_expires_at=NULL,error_code=$5,completed_at=CASE WHEN $3='unavailable' THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND lease_token=$2`,
      [row.id,input.leaseToken,status,delay,errorCode]);
      await client.query('INSERT INTO gradebook_verification_events(verification_job_id,status,reason) VALUES($1,$2,$3)',[row.id,status,errorCode]);
      return status;
    });
  }

  private async finish(client: import('pg').PoolClient, id: string, status: string, summary: GradebookVerificationSummary, error: string|null, reason: string) {
    await client.query(`UPDATE gradebook_verification_jobs SET status=$2,result_summary=$3,error_code=$4,
      lease_token=NULL,lease_expires_at=NULL,completed_at=clock_timestamp() WHERE id=$1`,[id,status,JSON.stringify(summary),error]);
    await client.query('INSERT INTO gradebook_verification_events(verification_job_id,status,reason) VALUES($1,$2,$3)',[id,status,reason]);
  }
}

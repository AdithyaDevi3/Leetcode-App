import { evaluatePracticeRevision } from '@/lib/practice-api';
import { createEvaluationJobStore } from '@/lib/evaluation-jobs-postgres';

export async function recoverStaleEvaluationJobs(staleAfterMs = Number(process.env.EVALUATION_JOB_STALE_AFTER_MS ?? 300_000)) {
  const store = createEvaluationJobStore();
  try { return await store.recoverStaleRunning(staleAfterMs); }
  finally { await store.close(); }
}

export async function processNextEvaluationJob() {
  const store = createEvaluationJobStore();
  try {
    const job = await store.claimNext();
    if (!job) return null;
    try {
      const result = await evaluatePracticeRevision({ userId: job.userId, sessionId: job.sessionId, revisionNumber: job.revisionNumber });
      const saved = await store.complete(job.id, result, job.attempts);
      return { jobId: job.id, status: saved ? 'completed' as const : 'stale' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown evaluation failure';
      const saved = await store.fail(job.id, message, job.attempts);
      return { jobId: job.id, status: saved ? 'failed' as const : 'stale' as const, error: message };
    }
  } finally { await store.close(); }
}

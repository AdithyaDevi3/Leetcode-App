import { evaluatePracticeRevision } from '@/lib/practice-api';
import { createEvaluationJobStore } from '@/lib/evaluation-jobs-postgres';

export async function recoverStaleEvaluationJobs(staleAfterMs = Number(process.env.EVALUATION_JOB_STALE_AFTER_MS ?? 300_000)) {
  return createEvaluationJobStore().recoverStaleRunning(staleAfterMs);
}

export async function processNextEvaluationJob() {
  const store = createEvaluationJobStore();
  const job = await store.claimNext();
  if (!job) return null;
  try {
    const result = await evaluatePracticeRevision({ userId: job.userId, sessionId: job.sessionId, revisionNumber: job.revisionNumber });
    await store.complete(job.id, result);
    return { jobId: job.id, status: 'completed' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown evaluation failure';
    await store.fail(job.id, message);
    return { jobId: job.id, status: 'failed' as const, error: message };
  }
}

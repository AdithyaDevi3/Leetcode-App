import { createExecutionJobStore } from '@/lib/execution-jobs-postgres';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';

const codeExecutionEnabled = () => process.env.CODE_EXECUTION_ENABLED === 'true';
export async function failStaleExecutionJobs(staleAfterMs = Number(process.env.EXECUTION_JOB_STALE_AFTER_MS ?? 300_000)) {
  const store = createExecutionJobStore();
  try { return await store.failStaleRunning(staleAfterMs); }
  finally { await store.close(); }
}

export async function processNextExecutionJob() {
  if (!codeExecutionEnabled()) return null;
  const store = createExecutionJobStore();
  try {
    const job = await store.claimNext();
    if (!job) return null;
    try {
      const result = await createConfiguredSandbox().execute(job.request);
      const saved = await store.complete(job.id, result, job.attempts);
      return { jobId: job.id, status: saved ? result.status : 'stale' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown execution failure';
      const saved = await store.fail(job.id, message, job.attempts);
      return { jobId: job.id, status: saved ? 'failed' as const : 'stale' as const, error: message };
    }
  } finally { await store.close(); }
}

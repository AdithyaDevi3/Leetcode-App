import { createExecutionJobStore } from '@/lib/execution-jobs-postgres';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';

const codeExecutionEnabled = () => process.env.CODE_EXECUTION_ENABLED === 'true';
export async function failStaleExecutionJobs(staleAfterMs = Number(process.env.EXECUTION_JOB_STALE_AFTER_MS ?? 300_000)) {
  return createExecutionJobStore().failStaleRunning(staleAfterMs);
}

export async function processNextExecutionJob() {
  if (!codeExecutionEnabled()) return null;
  const store = createExecutionJobStore();
  const job = await store.claimNext();
  if (!job) return null;
  try {
    const result = await createConfiguredSandbox().execute(job.request);
    await store.complete(job.id, result);
    return { jobId: job.id, status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown execution failure';
    await store.fail(job.id, message);
    return { jobId: job.id, status: 'failed' as const, error: message };
  }
}

import { cancelEvaluationJob, enqueueEvaluationJob, getEvaluationJob, runEvaluationJob, type EvaluationJob, type EvaluationJobRequest } from './evaluation-jobs';
import { createEvaluationJobStore } from './evaluation-jobs-postgres';
import { getEvaluationQueueMetrics } from './evaluation-jobs';

const isPostgresEnabled = () => process.env.EVALUATION_JOB_STORE === 'postgres';
let postgresStore: ReturnType<typeof createEvaluationJobStore> | undefined;
const getPostgresStore = () => (postgresStore ??= createEvaluationJobStore());

export async function enqueueRuntimeJob(request: EvaluationJobRequest): Promise<EvaluationJob> {
  if (isPostgresEnabled()) return getPostgresStore().enqueue(request);
  return enqueueEvaluationJob(request);
}
export async function getRuntimeJob(jobId: string): Promise<EvaluationJob | null> {
  if (isPostgresEnabled()) return getPostgresStore().findById(jobId);
  return getEvaluationJob(jobId);
}
export async function getOwnedRuntimeJob(jobId: string, userId: string, sessionId: string): Promise<EvaluationJob | null> {
  if (isPostgresEnabled()) return getPostgresStore().findOwned(jobId, userId, sessionId);
  const job = getEvaluationJob(jobId);
  return job && job.userId === userId && job.sessionId === sessionId ? job : null;
}
export async function cancelRuntimeJob(jobId: string, userId: string, sessionId: string): Promise<EvaluationJob | null> {
  if (isPostgresEnabled()) return getPostgresStore().cancel(jobId, userId, sessionId);
  return cancelEvaluationJob(jobId);
}
export async function runRuntimeJob(jobId: string, executor: () => Promise<unknown> | unknown): Promise<EvaluationJob | null> {
  if (isPostgresEnabled()) return getRuntimeJob(jobId);
  return runEvaluationJob(jobId, executor);
}
export async function getRuntimeQueueMetrics() {
  if (isPostgresEnabled()) return getPostgresStore().metrics();
  return getEvaluationQueueMetrics();
}

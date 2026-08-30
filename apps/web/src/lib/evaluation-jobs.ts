import { randomUUID } from 'node:crypto';

export type EvaluationJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export type EvaluationJob = {
  id: string;
  userId: string;
  sessionId: string;
  revisionNumber: number;
  evaluatorVersion: string;
  rubricVersion: string;
  status: EvaluationJobStatus;
  queuePosition: number;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: unknown;
  error: string | null;
  attempts: number;
  maxAttempts: number;
  deadLetteredAt: string | null;
};

export type EvaluationJobRequest = {
  userId: string;
  sessionId: string;
  revisionNumber: number;
  evaluatorVersion?: string;
  rubricVersion?: string;
};

const jobs = new Map<string, EvaluationJob>();
const jobKeys = new Map<string, string>();
const deadLetter = new Set<string>();

const isCanceled = (job: EvaluationJob) => job.status === 'canceled';
const getJobStatus = (job: EvaluationJob): EvaluationJobStatus => job.status;

const buildJobKey = (request: Pick<EvaluationJobRequest, 'userId' | 'sessionId' | 'revisionNumber' | 'evaluatorVersion' | 'rubricVersion'>) =>
  [request.userId, request.sessionId, request.revisionNumber, request.evaluatorVersion ?? 'v1', request.rubricVersion ?? 'rubric-v1'].join(':');

async function completeJob(job: EvaluationJob, executor: () => Promise<unknown> | unknown) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();

  try {
    const result = await executor();
    if (isCanceled(job)) return;
    job.result = result;
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.error = null;
  } catch (error) {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : 'Unknown evaluation failure';
  }
}

export function enqueueEvaluationJob(request: EvaluationJobRequest): EvaluationJob {
  const jobKey = buildJobKey(request);
  const existingJobId = jobKeys.get(jobKey);

  if (existingJobId) {
    const existingJob = jobs.get(existingJobId);
    if (existingJob) {
      return existingJob;
    }
  }

  const job: EvaluationJob = {
    id: randomUUID(),
    userId: request.userId,
    sessionId: request.sessionId,
    revisionNumber: request.revisionNumber,
    evaluatorVersion: request.evaluatorVersion ?? 'v1',
    rubricVersion: request.rubricVersion ?? 'rubric-v1',
    status: 'queued',
    queuePosition: jobs.size + 1,
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    attempts: 0,
    maxAttempts: 3,
    deadLetteredAt: null,
  };

  jobs.set(job.id, job);
  jobKeys.set(jobKey, job.id);
  return job;
}

export async function runEvaluationJob(
  jobId: string,
  executor: () => Promise<unknown> | unknown,
  options: { maxAttempts?: number } = {},
): Promise<EvaluationJob | null> {
  const job = jobs.get(jobId);

  if (!job || job.status !== 'queued') {
    return job ?? null;
  }

  job.maxAttempts = options.maxAttempts ?? job.maxAttempts;
  while (job.attempts < job.maxAttempts && !isCanceled(job)) {
    job.attempts += 1;
    await completeJob(job, executor);
    const completedStatus = getJobStatus(job);
    if (completedStatus === 'completed' || completedStatus === 'canceled') return job;
    if (job.attempts < job.maxAttempts) {
      job.status = 'queued';
      job.startedAt = null;
      job.completedAt = null;
    }
  }
  const finalStatus = getJobStatus(job);
  if (finalStatus === 'failed' && job.attempts >= job.maxAttempts) {
    job.deadLetteredAt = new Date().toISOString();
    deadLetter.add(job.id);
  }
  return job;
}

export function getEvaluationJob(jobId: string): EvaluationJob | null {
  return jobs.get(jobId) ?? null;
}

export function cancelEvaluationJob(jobId: string): EvaluationJob | null {
  const job = jobs.get(jobId);

  if (!job || job.status === 'completed' || job.status === 'failed') {
    return job ?? null;
  }

  job.status = 'canceled';
  job.completedAt = new Date().toISOString();
  job.error = null;

  return job;
}

export function resetEvaluationJobsForTests() {
  jobs.clear();
  jobKeys.clear();
  deadLetter.clear();
}

export function getEvaluationQueueMetrics() {
  const all = [...jobs.values()];
  const now = Date.now();
  return {
    queued: all.filter((job) => job.status === 'queued').length,
    running: all.filter((job) => job.status === 'running').length,
    completed: all.filter((job) => job.status === 'completed').length,
    failed: all.filter((job) => job.status === 'failed').length,
    canceled: all.filter((job) => job.status === 'canceled').length,
    deadLettered: deadLetter.size,
    oldestQueuedAgeMs: all.filter((job) => job.status === 'queued')
      .reduce((oldest, job) => Math.max(oldest, now - Date.parse(job.queuedAt)), 0),
  };
}

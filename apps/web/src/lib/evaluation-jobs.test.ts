import { beforeEach, describe, expect, it } from 'vitest';
import { cancelEvaluationJob, enqueueEvaluationJob, getEvaluationQueueMetrics, resetEvaluationJobsForTests, runEvaluationJob } from './evaluation-jobs';

describe('evaluation jobs', () => {
  beforeEach(() => resetEvaluationJobsForTests());
  it('retries failures and dead-letters after the configured limit', async () => {
    const job = enqueueEvaluationJob({ userId: 'u', sessionId: 's', revisionNumber: 1 });
    const result = await runEvaluationJob(job.id, () => { throw new Error('provider unavailable'); }, { maxAttempts: 2 });
    expect(result).toMatchObject({ status: 'failed', attempts: 2, deadLetteredAt: expect.any(String) });
    expect(getEvaluationQueueMetrics()).toMatchObject({ failed: 1, deadLettered: 1 });
  });
  it('preserves cancellation when an in-flight executor finishes', async () => {
    const job = enqueueEvaluationJob({ userId: 'u', sessionId: 's', revisionNumber: 1 });
    let finish!: () => void;
    const running = runEvaluationJob(job.id, () => new Promise((resolve) => { finish = () => resolve('late result'); }));
    cancelEvaluationJob(job.id);
    finish();
    const result = await running;
    expect(result?.status).toBe('canceled');
    expect(result?.result).toBeNull();
  });
});

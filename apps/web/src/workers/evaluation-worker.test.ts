import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ claimNext: vi.fn(), complete: vi.fn(), fail: vi.fn(), close: vi.fn(), recover: vi.fn(), evaluate: vi.fn() }));
vi.mock('@/lib/evaluation-jobs-postgres', () => ({ createEvaluationJobStore: () => ({
  claimNext: mocks.claimNext, complete: mocks.complete, fail: mocks.fail, close: mocks.close, recoverStaleRunning: mocks.recover,
}) }));
vi.mock('@/lib/practice-api', () => ({ evaluatePracticeRevision: mocks.evaluate }));
import { processNextEvaluationJob, recoverStaleEvaluationJobs } from './evaluation-worker';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claimNext.mockResolvedValue({ id: 'job-1', userId: 'user-1', sessionId: 'session-1', revisionNumber: 4, attempts: 2 });
  mocks.evaluate.mockResolvedValue({ evaluation: { score: 95 } });
});

describe('evaluation worker claim ownership', () => {
  it('closes its store even when no work is queued', async () => {
    mocks.claimNext.mockResolvedValue(null);
    expect(await processNextEvaluationJob()).toBeNull();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it('completes only the claimed attempt and closes the worker-owned pool', async () => {
    mocks.complete.mockResolvedValue(true);
    expect(await processNextEvaluationJob()).toEqual({ jobId: 'job-1', status: 'completed' });
    expect(mocks.complete).toHaveBeenCalledWith('job-1', { evaluation: { score: 95 } }, 2);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('does not report completion when a recovered worker owns the job', async () => {
    mocks.complete.mockResolvedValue(false);
    expect(await processNextEvaluationJob()).toEqual({ jobId: 'job-1', status: 'stale' });
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([{ saved: true, status: 'failed' }, { saved: false, status: 'stale' }])(
    'reports $status when a failed evaluator still owns its claim: $saved', async ({ saved, status }) => {
      mocks.evaluate.mockRejectedValue(new Error('Temporary evaluator outage'));
      mocks.fail.mockResolvedValue(saved);
      expect(await processNextEvaluationJob()).toEqual({ jobId: 'job-1', status, error: 'Temporary evaluator outage' });
      expect(mocks.fail).toHaveBeenCalledWith('job-1', 'Temporary evaluator outage', 2);
      expect(mocks.close).toHaveBeenCalledOnce();
    },
  );

  it('releases the pool when claiming work throws', async () => {
    mocks.claimNext.mockRejectedValue(new Error('Database unavailable'));
    await expect(processNextEvaluationJob()).rejects.toThrow('Database unavailable');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('closes a recovery invocation after retrying abandoned work', async () => {
    mocks.recover.mockResolvedValue({ retried: 1, deadLettered: 0 });
    expect(await recoverStaleEvaluationJobs(60_000)).toEqual({ retried: 1, deadLettered: 0 });
    expect(mocks.recover).toHaveBeenCalledWith(60_000);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('closes a recovery invocation when its database query fails', async () => {
    mocks.recover.mockRejectedValue(new Error('Database unavailable'));
    await expect(recoverStaleEvaluationJobs(60_000)).rejects.toThrow('Database unavailable');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

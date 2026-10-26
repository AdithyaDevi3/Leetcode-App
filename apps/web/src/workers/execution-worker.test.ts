import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ claimNext: vi.fn(), complete: vi.fn(), fail: vi.fn(), close: vi.fn(), recover: vi.fn(), execute: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/execution-jobs-postgres', () => ({ createExecutionJobStore: () => {
  mocks.create();
  return { claimNext: mocks.claimNext, complete: mocks.complete, fail: mocks.fail, close: mocks.close, failStaleRunning: mocks.recover };
} }));
vi.mock('@/lib/sandbox/runtime', () => ({ createConfiguredSandbox: () => ({ execute: mocks.execute }) }));
import { processNextExecutionJob, failStaleExecutionJobs } from './execution-worker';

const request = { language: 'python', source: 'print("fixture")', limits: { timeoutMs: 3000, memoryMb: 256, outputBytes: 50_000 } };
const result = { status: 'completed', stdout: 'fixture', stderr: '', exitCode: 0, durationMs: 1, limits: request.limits };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CODE_EXECUTION_ENABLED', 'true');
  mocks.claimNext.mockResolvedValue({ id: 'run-1', request, attempts: 1 });
  mocks.execute.mockResolvedValue(result);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('execution worker durable acknowledgement', () => {
  it('does not claim work or allocate a pool when execution is disabled', async () => {
    vi.stubEnv('CODE_EXECUTION_ENABLED', 'false');
    expect(await processNextExecutionJob()).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('closes its pool when no work is queued', async () => {
    mocks.claimNext.mockResolvedValue(null);
    expect(await processNextExecutionJob()).toBeNull();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('reports completion only after storing the current claim result', async () => {
    mocks.complete.mockResolvedValue(true);
    expect(await processNextExecutionJob()).toEqual({ jobId: 'run-1', status: 'completed' });
    expect(mocks.execute).toHaveBeenCalledWith(request);
    expect(mocks.complete).toHaveBeenCalledWith('run-1', result, 1);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('reports a stale result when recovery already marked its unknown outcome failed', async () => {
    mocks.complete.mockResolvedValue(false);
    expect(await processNextExecutionJob()).toEqual({ jobId: 'run-1', status: 'stale' });
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.fail).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([{ saved: true, status: 'failed' }, { saved: false, status: 'stale' }])(
    'reports $status for a failed execution whose claim is current: $saved', async ({ saved, status }) => {
      mocks.execute.mockRejectedValue(new Error('Sandbox fixture unavailable'));
      mocks.fail.mockResolvedValue(saved);
      expect(await processNextExecutionJob()).toEqual({ jobId: 'run-1', status, error: 'Sandbox fixture unavailable' });
      expect(mocks.fail).toHaveBeenCalledWith('run-1', 'Sandbox fixture unavailable', 1);
      expect(mocks.close).toHaveBeenCalledOnce();
    },
  );

  it('closes its pool when claiming work fails', async () => {
    mocks.claimNext.mockRejectedValue(new Error('Database fixture unavailable'));
    await expect(processNextExecutionJob()).rejects.toThrow('Database fixture unavailable');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('fails expired unknown runs and closes the recovery-owned pool', async () => {
    mocks.recover.mockResolvedValue(1);
    expect(await failStaleExecutionJobs(60_000)).toBe(1);
    expect(mocks.recover).toHaveBeenCalledWith(60_000);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('closes its pool if execution recovery fails', async () => {
    mocks.recover.mockRejectedValue(new Error('Database fixture unavailable'));
    await expect(failStaleExecutionJobs(60_000)).rejects.toThrow('Database fixture unavailable');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

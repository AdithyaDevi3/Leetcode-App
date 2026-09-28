import { describe, expect, it, vi, beforeEach } from 'vitest';

const claimNext = vi.fn();
const resolve = vi.fn();
const unavailable = vi.fn();
const execute = vi.fn();
const close = vi.fn();

vi.mock('@leetcode-app/database', () => ({
  ASSIGNMENT_VERIFIER_VERSION: 'stdin-stdout-v1',
  createDatabaseClient: vi.fn(() => ({ close })),
  databaseConfigFromEnv: vi.fn(),
  PostgresGradebookVerificationRepository: class { claimNext = claimNext; resolve = resolve; unavailable = unavailable; },
}));
vi.mock('@/lib/sandbox/runtime', () => ({ createConfiguredSandbox: () => ({ execute }) }));

describe('processNextVerificationJob', () => {
  beforeEach(() => {
    claimNext.mockReset();
    resolve.mockReset();
    unavailable.mockReset();
    execute.mockReset();
    close.mockReset();
    process.env.CODE_EXECUTION_ENABLED = 'true';
  });

  it('returns null when no job is queued', async () => {
    claimNext.mockResolvedValue(null);
    const { processNextVerificationJob } = await import('./verification-worker');
    expect(await processNextVerificationJob()).toBeNull();
  });

  it('resolves a passed job when every pinned test matches', async () => {
    claimNext.mockResolvedValue({
      id: 'job-1', leaseToken: 'lease-1', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print("ok")',
      pinnedTests: [{ input: '[2,7,11,15],9', expected: '[0,1]' }],
    });
    execute.mockResolvedValue({ status: 'completed', stdout: '[0,1]\n', stderr: '', exitCode: 0, durationMs: 10, limits: { timeoutMs: 3000, memoryMb: 256, outputBytes: 50_000 } });
    resolve.mockResolvedValue('grade-1');
    const { processNextVerificationJob } = await import('./verification-worker');
    const result = await processNextVerificationJob();
    expect(result).toEqual({ jobId: 'job-1', status: 'passed' });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', leaseToken: 'lease-1', outcome: 'passed' }));
  });

  it('resolves a failed job when a pinned test does not match', async () => {
    claimNext.mockResolvedValue({
      id: 'job-2', leaseToken: 'lease-2', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print("bad")',
      pinnedTests: [{ input: '[2,7,11,15],9', expected: '[0,1]' }],
    });
    execute.mockResolvedValue({ status: 'completed', stdout: 'wrong', stderr: '', exitCode: 0, durationMs: 5, limits: { timeoutMs: 3000, memoryMb: 256, outputBytes: 50_000 } });
    resolve.mockResolvedValue('grade-2');
    const { processNextVerificationJob } = await import('./verification-worker');
    const result = await processNextVerificationJob();
    expect(result).toEqual({ jobId: 'job-2', status: 'failed' });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
  });

  it('marks the job unavailable when the sandbox throws', async () => {
    claimNext.mockResolvedValue({
      id: 'job-3', leaseToken: 'lease-3', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print("ok")',
      pinnedTests: [{ input: '1', expected: '1' }],
    });
    execute.mockRejectedValue(new Error('Sandbox unavailable'));
    unavailable.mockResolvedValue('queued');
    const { processNextVerificationJob } = await import('./verification-worker');
    const result = await processNextVerificationJob();
    expect(result).toEqual({ jobId: 'job-3', status: 'queued' });
    expect(unavailable).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-3', leaseToken: 'lease-3', errorCode: 'sandbox-unavailable' }));
  });

  it('marks malformed pinned evidence unavailable without executing it', async () => {
    claimNext.mockResolvedValue({ id: 'job-4', leaseToken: 'lease-4', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print(1)', pinnedTests: [{ input: 1, expected: '1' }] });
    unavailable.mockResolvedValue('queued');
    const { processNextVerificationJob } = await import('./verification-worker');
    expect(await processNextVerificationJob()).toEqual({ jobId: 'job-4', status: 'queued' });
    expect(execute).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'invalid-pinned-test-suite' }));
  });

  it('rejects pinned multibyte output beyond the sandbox byte limit', async () => {
    claimNext.mockResolvedValue({ id: 'job-bytes', leaseToken: 'lease-bytes', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print(1)', pinnedTests: [{ input: '', expected: '界'.repeat(20_000) }] });
    unavailable.mockResolvedValue('queued');
    const { processNextVerificationJob } = await import('./verification-worker');
    expect(await processNextVerificationJob()).toEqual({ jobId: 'job-bytes', status: 'queued' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('marks malformed sandbox results unavailable instead of creating a zero', async () => {
    claimNext.mockResolvedValue({ id: 'job-5', leaseToken: 'lease-5', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print(1)', pinnedTests: [{ input: '', expected: '1' }] });
    execute.mockResolvedValue({ status: 'running', stdout: '', durationMs: 1 });
    unavailable.mockResolvedValue('queued');
    const { processNextVerificationJob } = await import('./verification-worker');
    expect(await processNextVerificationJob()).toEqual({ jobId: 'job-5', status: 'queued' });
    expect(resolve).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'invalid-sandbox-result' }));
  });

  it('executes every pinned case and submits a bounded aggregate summary', async () => {
    claimNext.mockResolvedValue({ id: 'job-6', leaseToken: 'lease-6', verifierVersionId: 'stdin-stdout-v1', language: 'python', source: 'print(input())', pinnedTests: [{ input: 'a', expected: 'a' }, { input: 'b', expected: 'z' }] });
    execute.mockResolvedValueOnce({ status: 'completed', stdout: 'a\n', durationMs: 7 }).mockResolvedValueOnce({ status: 'completed', stdout: 'b\n', durationMs: 11 });
    resolve.mockResolvedValue('grade-6');
    const { processNextVerificationJob } = await import('./verification-worker');
    expect(await processNextVerificationJob()).toEqual({ jobId: 'job-6', status: 'failed' });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed', summary: { passedTests: 1, totalTests: 2, durationMs: 18 } }));
  });

  it('does not claim work while code execution is disabled', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    const { processNextVerificationJob } = await import('./verification-worker');
    expect(await processNextVerificationJob()).toBeNull();
    expect(claimNext).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const processNextVerificationJob = vi.fn();
vi.mock('@/workers/verification-worker', () => ({ processNextVerificationJob }));

describe('/api/internal/workers/verifications', () => {
  beforeEach(() => {
    processNextVerificationJob.mockReset();
  });
  it('rejects requests without the worker token', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'true';
    process.env.VERIFICATION_WORKER_TOKEN = 'test-token';
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('processes a bounded worker batch', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'true';
    process.env.VERIFICATION_WORKER_TOKEN = 'test-token';
    processNextVerificationJob.mockResolvedValueOnce({ jobId: 'job-1', status: 'passed' }).mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ limit: 20 }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: [{ jobId: 'job-1', status: 'passed' }] });
    expect(processNextVerificationJob).toHaveBeenCalledOnce();
  });

  it('does not claim jobs while code execution is disabled', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    process.env.VERIFICATION_WORKER_TOKEN = 'test-token';
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer test-token' } }));
    expect(response.status).toBe(503);
    expect(processNextVerificationJob).not.toHaveBeenCalled();
  });
});

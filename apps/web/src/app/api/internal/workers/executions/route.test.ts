import { describe, expect, it, vi } from 'vitest';
const processNextExecutionJob = vi.fn();
const failStaleExecutionJobs = vi.fn();
vi.mock('@/workers/execution-worker', () => ({ processNextExecutionJob, failStaleExecutionJobs }));

describe('/api/internal/workers/executions', () => {
  it('requires the execution worker token', async () => {
    process.env.EXECUTION_WORKER_TOKEN = 'execution-token';
    failStaleExecutionJobs.mockResolvedValue(1);
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST' })).status)).toBe(401);
  });
  it('processes a bounded batch', async () => {
    process.env.EXECUTION_WORKER_TOKEN = 'execution-token';
    processNextExecutionJob.mockResolvedValueOnce({ jobId: 'run-1', status: 'completed' }).mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer execution-token' }, body: JSON.stringify({ limit: 10 }) }));
    expect(await response.json()).toEqual({ recoveredFailed: 1, processed: [{ jobId: 'run-1', status: 'completed' }] });
  });
});

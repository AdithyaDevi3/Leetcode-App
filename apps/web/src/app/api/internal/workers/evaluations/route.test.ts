import { describe, expect, it, vi } from 'vitest';

const processNextEvaluationJob = vi.fn();
const recoverStaleEvaluationJobs = vi.fn();
vi.mock('@/workers/evaluation-worker', () => ({ processNextEvaluationJob, recoverStaleEvaluationJobs }));

describe('/api/internal/workers/evaluations', () => {
  it('rejects requests without the worker token', async () => {
    process.env.EVALUATION_WORKER_TOKEN = 'test-token';
    recoverStaleEvaluationJobs.mockResolvedValue({ retried: 1, deadLettered: 0 });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST' }));
    expect(response.status).toBe(401);
  });
  it('processes a bounded worker batch', async () => {
    process.env.EVALUATION_WORKER_TOKEN = 'test-token';
    processNextEvaluationJob.mockResolvedValueOnce({ jobId: 'job-1', status: 'completed' }).mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer test-token' }, body: JSON.stringify({ limit: 20 }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recovered: { retried: 1, deadLettered: 0 }, processed: [{ jobId: 'job-1', status: 'completed' }] });
    expect(processNextEvaluationJob).toHaveBeenCalledTimes(2);
  });
});

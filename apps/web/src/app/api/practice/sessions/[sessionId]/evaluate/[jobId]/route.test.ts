import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueEvaluationJob, resetEvaluationJobsForTests } from '@/lib/evaluation-jobs';

const requireAuth = vi.fn();

vi.mock('@/lib/auth/session', () => ({ requireAuth }));

describe('/api/practice/sessions/[sessionId]/evaluate/[jobId]', () => {
  beforeEach(() => {
    requireAuth.mockReset();
    resetEvaluationJobsForTests();
  });

  it('returns the owned job status and hides result while queued', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const job = enqueueEvaluationJob({ userId: 'user-1', sessionId: 'session-1', revisionNumber: 2 });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ sessionId: 'session-1', jobId: job.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId: job.id, status: 'queued' });
  });

  it('cancels an owned queued job', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const job = enqueueEvaluationJob({ userId: 'user-1', sessionId: 'session-1', revisionNumber: 2 });
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ sessionId: 'session-1', jobId: job.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId: job.id, status: 'canceled' });
  });

  it('does not reveal another user’s job', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-2' } });
    const job = enqueueEvaluationJob({ userId: 'user-1', sessionId: 'session-1', revisionNumber: 2 });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ sessionId: 'session-1', jobId: job.id }) });
    expect(response.status).toBe(404);
  });
});

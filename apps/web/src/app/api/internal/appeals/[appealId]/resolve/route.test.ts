import { describe, expect, it, vi } from 'vitest';

const resolveRuntimeAppeal = vi.fn();
vi.mock('@/lib/evaluation-appeal-runtime', () => ({ resolveRuntimeAppeal }));

describe('/api/internal/appeals/[appealId]/resolve', () => {
  it('requires the reviewer token', async () => {
    process.env.EVALUATION_REVIEWER_TOKEN = 'review-token';
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ appealId: 'appeal-1' }) })).status).toBe(401);
  });
  it('resolves an appeal with an explicit reason', async () => {
    process.env.EVALUATION_REVIEWER_TOKEN = 'review-token';
    resolveRuntimeAppeal.mockResolvedValue({ id: 'appeal-1', status: 'resolved' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', headers: { authorization: 'Bearer review-token' }, body: JSON.stringify({ reviewerId: 'reviewer-1', approved: true, reason: 'Evidence confirms the plan.' }) }), { params: Promise.resolve({ appealId: 'appeal-1' }) });
    expect(response.status).toBe(200);
    expect(resolveRuntimeAppeal).toHaveBeenCalledWith('appeal-1', { reviewerId: 'reviewer-1', approved: true, reason: 'Evidence confirms the plan.' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const getPracticeSessionHistory = vi.fn(); const enqueue = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/practice-api', () => ({ getPracticeSessionHistory }));
vi.mock('@/lib/execution-jobs-postgres', () => ({ createExecutionJobStore: () => ({ enqueue }) }));

const request = { language: 'typescript', source: 'console.log(1)', limits: { timeoutMs: 1000, memoryMb: 128, outputBytes: 10_000 } };
describe('/api/practice/sessions/[sessionId]/execute', () => {
  beforeEach(() => { vi.resetAllMocks(); process.env.CODE_EXECUTION_ENABLED = 'true'; });
  it('queues an owned, bounded execution request', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); getPracticeSessionHistory.mockResolvedValue({}); enqueue.mockResolvedValue({ id: 'job-1', status: 'queued', queuedAt: '2026-08-29T00:00:00Z' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(request) }), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(response.status).toBe(202); expect(enqueue).toHaveBeenCalledWith({ userId: 'user-1', sessionId: 'session-1', request });
  });
  it('keeps execution disabled by default', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST' }), { params: Promise.resolve({ sessionId: 'session-1' }) })).status).toBe(503);
  });
});

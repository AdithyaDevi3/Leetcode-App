import { describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const findOwned = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/execution-jobs-postgres', () => ({ createExecutionJobStore: () => ({ findOwned }) }));

describe('/api/practice/sessions/[sessionId]/execute/[jobId]', () => {
  it('returns only an owned execution job', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); findOwned.mockResolvedValue({ id: 'job-1', status: 'completed', queuedAt: '2026-08-29T00:00:00Z', startedAt: null, completedAt: null, result: { stdout: '1' }, error: null });
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ sessionId: 'session-1', jobId: 'job-1' }) });
    expect(response.status).toBe(200); expect(findOwned).toHaveBeenCalledWith('job-1', 'user-1', 'session-1');
  });
});

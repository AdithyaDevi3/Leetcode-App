import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn();
const listOwned = vi.fn();
const requestLifecycle = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/account-lifecycle-store', () => ({ createAccountLifecycleStore: () => ({ listOwned, request: requestLifecycle }) }));

describe('/api/account/lifecycle', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('creates an authenticated deletion request', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    requestLifecycle.mockResolvedValue({ id: 'request-1', type: 'deletion', status: 'requested' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/account/lifecycle', { method: 'POST', body: JSON.stringify({ type: 'deletion', reason: 'No longer need it' }) }));
    expect(response.status).toBe(202);
    expect(requestLifecycle).toHaveBeenCalledWith('user-1', 'deletion', 'No longer need it');
  });
  it('rejects an invalid request type', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ type: 'erase' }) }))).status).toBe(400);
  });
});

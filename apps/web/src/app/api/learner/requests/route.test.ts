import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPracticeOwner = vi.fn(); const list = vi.fn(); const create = vi.fn();
vi.mock('@/lib/auth/session', () => ({ getPracticeOwner }));
vi.mock('@/lib/learner-requests', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/learner-requests')>()), createLearnerRequestsStore: () => ({ list, create }) }));

describe('/api/learner/requests', () => {
  beforeEach(() => vi.resetAllMocks());
  it('lists requests for the current guest or user owner', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'guest', id: 'guest-1' }); list.mockResolvedValue([]);
    const { GET } = await import('./route');
    expect((await GET()).status).toBe(200); expect(list).toHaveBeenCalledWith({ kind: 'guest', id: 'guest-1' });
  });
  it('validates and creates a request', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' }); create.mockResolvedValue({ id: 'request-1' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ type: 'question', title: 'Add a queue problem', description: 'Please add a queue problem with a detailed walkthrough.' }) }));
    expect(response.status).toBe(201); expect(create).toHaveBeenCalledWith({ kind: 'user', id: 'user-1' }, { type: 'question', title: 'Add a queue problem', description: 'Please add a queue problem with a detailed walkthrough.', sourceUrl: null });
  });
  it('rejects malformed requests', async () => {
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ type: 'feature', title: 'x', description: 'short' }) }))).status).toBe(400);
  });
});

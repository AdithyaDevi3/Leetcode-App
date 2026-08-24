import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const appendPracticeRevision = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  requireAuth,
}));

vi.mock('@/lib/practice-api', () => ({
  appendPracticeRevision,
}));

describe('/api/practice/sessions/[sessionId]', () => {
  beforeEach(() => {
    requireAuth.mockReset();
    appendPracticeRevision.mockReset();
  });

  it('returns 400 when draft is missing', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/practice/sessions/session-1', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'draft is required' });
    expect(appendPracticeRevision).not.toHaveBeenCalled();
  });

  it('delegates revision appends to the practice service', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    appendPracticeRevision.mockResolvedValue({
      revision: {
        sessionId: 'session-1',
        revisionNumber: 2,
        draft: 'Use a map.',
        currentStage: 'plan',
        status: 'in_progress',
        updatedAt: '2026-08-19T00:00:00.000Z',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/practice/sessions/session-1', {
        method: 'POST',
        body: JSON.stringify({ draft: 'Use a map.', currentStage: 'plan' }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(201);
    expect(appendPracticeRevision).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      draft: 'Use a map.',
      currentStage: 'plan',
    });
  });
});
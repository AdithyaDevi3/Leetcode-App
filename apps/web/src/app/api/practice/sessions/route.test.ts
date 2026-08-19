import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const startOrResumePracticeSession = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  requireAuth,
}));

vi.mock('@/lib/practice-api', () => ({
  startOrResumePracticeSession,
}));

describe('/api/practice/sessions', () => {
  beforeEach(() => {
    requireAuth.mockReset();
    startOrResumePracticeSession.mockReset();
  });

  it('returns 400 when contentId is missing', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost/api/practice/sessions'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'contentId is required' });
    expect(startOrResumePracticeSession).not.toHaveBeenCalled();
  });

  it('delegates to the practice service', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    startOrResumePracticeSession.mockResolvedValue({
      created: true,
      session: {
        id: 'session-1',
        contentId: 'two-sum',
        currentStage: 'understand',
        status: 'not_started',
        revision: 1,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
        sessionMetadata: {},
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/practice/sessions', {
        method: 'POST',
        body: JSON.stringify({ contentId: 'two-sum' }),
      }),
    );

    expect(response.status).toBe(201);
    expect(startOrResumePracticeSession).toHaveBeenCalledWith({ userId: 'user-1', contentId: 'two-sum' });
  });
});
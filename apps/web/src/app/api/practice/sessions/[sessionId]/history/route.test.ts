import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPracticeOwner = vi.fn();
const getPracticeSessionHistory = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getPracticeOwner,
}));

vi.mock('@/lib/practice-api', () => ({
  getPracticeSessionHistory,
}));

describe('/api/practice/sessions/[sessionId]/history', () => {
  beforeEach(() => {
    getPracticeOwner.mockReset();
    getPracticeSessionHistory.mockReset();
  });

  it('returns the current session history', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    getPracticeSessionHistory.mockResolvedValue({
      session: {
        id: 'session-1',
        contentId: 'two-sum',
        currentStage: 'plan',
        status: 'in_progress',
        revision: 2,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
        sessionMetadata: { draft: 'Use a map.' },
      },
      revisions: [{ id: 'rev-1', revisionNumber: 1, content: 'Use a map.', createdAt: '2026-08-19T00:00:00.000Z' }],
    });

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/practice/sessions/session-1/history'), {
      params: Promise.resolve({ sessionId: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(getPracticeSessionHistory).toHaveBeenCalledWith({ owner: { kind: 'user', id: 'user-1' }, sessionId: 'session-1' });
  });
});

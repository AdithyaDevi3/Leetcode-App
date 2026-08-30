import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPracticeOwner = vi.fn();
const completePracticeSession = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getPracticeOwner,
}));

vi.mock('@/lib/practice-api', () => ({
  completePracticeSession,
}));

describe('/api/practice/sessions/[sessionId]/complete', () => {
  beforeEach(() => {
    getPracticeOwner.mockReset();
    completePracticeSession.mockReset();
  });

  it('delegates completion to the practice service', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    completePracticeSession.mockResolvedValue({
      session: {
        id: 'session-1',
        contentId: 'two-sum',
        currentStage: 'evaluate',
        status: 'completed',
        revision: 3,
        createdAt: '2026-08-19T00:00:00.000Z',
        updatedAt: '2026-08-19T00:00:00.000Z',
        sessionMetadata: { completed: true },
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/practice/sessions/session-1/complete', {
        method: 'POST',
        body: JSON.stringify({ completed: true, currentStage: 'evaluate' }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(completePracticeSession).toHaveBeenCalledWith({
      owner: { kind: 'user', id: 'user-1' },
      sessionId: 'session-1',
      completed: true,
      currentStage: 'evaluate',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const evaluatePracticeRevision = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  requireAuth,
}));

vi.mock('@/lib/practice-api', () => ({
  evaluatePracticeRevision,
}));

describe('/api/practice/sessions/[sessionId]/evaluate', () => {
  beforeEach(() => {
    requireAuth.mockReset();
    evaluatePracticeRevision.mockReset();
  });

  it('returns 400 when revisionNumber is missing', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/practice/sessions/session-1/evaluate', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'revisionNumber is required' });
    expect(evaluatePracticeRevision).not.toHaveBeenCalled();
  });

  it('delegates evaluation to the practice service', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    evaluatePracticeRevision.mockResolvedValue({
      evaluation: {
        sessionId: 'session-1',
        revisionNumber: 2,
        approved: true,
        score: 100,
        summary: 'Ready to code.',
        findings: [],
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/practice/sessions/session-1/evaluate', {
        method: 'POST',
        body: JSON.stringify({ revisionNumber: 2 }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      jobId: expect.any(String),
      status: 'completed',
      queuePosition: 1,
    });
    expect(evaluatePracticeRevision).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      revisionNumber: 2,
    });
  });
});
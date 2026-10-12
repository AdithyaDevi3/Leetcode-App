import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPracticeOwner = vi.fn();
const appendPracticeRevision = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getPracticeOwner,
}));

vi.mock('@/lib/practice-api', () => ({
  appendPracticeRevision,
}));

describe('/api/practice/sessions/[sessionId]', () => {
  beforeEach(() => {
    getPracticeOwner.mockReset();
    appendPracticeRevision.mockReset();
  });

  it('returns 400 when draft is missing', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
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
    getPracticeOwner.mockResolvedValue({ kind: 'guest', id: 'guest-1' });
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
        body: JSON.stringify({ draft: 'Use a map.', currentStage: 'plan', state: {
          draft: 'Use a map.', mode: 'text', language: 'python', code: 'pass', codeChecked: false,
          completed: false, evaluation: null, codeGrade: null,
        } }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(201);
    expect(appendPracticeRevision).toHaveBeenCalledWith({
      owner: { kind: 'guest', id: 'guest-1' },
      sessionId: 'session-1',
      draft: 'Use a map.',
      currentStage: 'plan',
      workspaceState: {
        draft: 'Use a map.', mode: 'text', language: 'python', code: 'pass', codeChecked: false,
        completed: false, evaluation: null, codeGrade: null,
      },
    });
  });

  it('rejects malformed or oversized workspace state', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    const { POST } = await import('./route');
    const invalid = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ draft: 'Plan', state: { draft: 'Plan' } }) }), { params: Promise.resolve({ sessionId: 'session-1' }) });
    const oversized = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ draft: 'Plan', state: { code: 'x'.repeat(250_001) } }) }), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(appendPracticeRevision).not.toHaveBeenCalled();
  });
});

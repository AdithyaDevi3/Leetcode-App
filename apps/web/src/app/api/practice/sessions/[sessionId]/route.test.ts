import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeRevisionConflict } from '@/lib/practice-sync-contract';

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

  it('forwards a valid conditional save and returns a recoverable stale-revision conflict', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    appendPracticeRevision.mockRejectedValue(new PracticeRevisionConflict(4));
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', headers: { 'x-practice-owner': 'user:user-1' },
      body: JSON.stringify({ draft: 'Local plan.', expectedRevisionNumber: 3, requestKey: 'save-1' }),
    }), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'revision_conflict', currentRevisionNumber: 4 });
    expect(appendPracticeRevision).toHaveBeenCalledWith(expect.objectContaining({ expectedRevisionNumber: 3, requestKey: 'save-1' }));
  });

  it('rejects malformed conditional saves and a changed owner before writing', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-2' });
    const { POST } = await import('./route');
    const context = { params: Promise.resolve({ sessionId: 'session-1' }) };
    for (const condition of [{ expectedRevisionNumber: 0 }, { requestKey: 'save' }, { requestKey: 'save', expectedRevisionNumber: -1 }, { requestKey: 'save', expectedRevisionNumber: 0.5 }]) {
      const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ draft: 'Plan.', ...condition }) }), context);
      expect(response.status).toBe(400);
    }
    const changed = await POST(new Request('http://localhost', { method: 'POST', headers: { 'x-practice-owner': 'user:user-1' }, body: JSON.stringify({ draft: 'Old account plan.' }) }), context);
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ code: 'owner_changed' });
    expect(appendPracticeRevision).not.toHaveBeenCalled();
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

  it('saves coding-only work without requiring a reasoning answer', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    appendPracticeRevision.mockResolvedValue({ revision: { revisionNumber: 3 } });
    const workspace = {
      draft: '', mode: 'text', language: 'python', code: 'def find_pair(values, target):\n    return [0, 1]',
      codeChecked: false, completed: false, evaluation: null, codeGrade: null,
    };
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', {
      method: 'POST', body: JSON.stringify({ draft: '', currentStage: 'implement', state: workspace }),
    }), { params: Promise.resolve({ sessionId: 'session-1' }) });

    expect(response.status).toBe(201);
    expect(appendPracticeRevision).toHaveBeenCalledWith({
      owner: { kind: 'user', id: 'user-1' }, sessionId: 'session-1',
      draft: '', currentStage: 'implement', workspaceState: workspace,
    });
  });

  it('rejects empty work without a usable code workspace', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    const { POST } = await import('./route');
    const state = { draft: '', mode: 'text', language: 'python', code: '  ', codeChecked: false, completed: false, evaluation: null, codeGrade: null };
    for (const payload of [{ draft: '' }, { draft: '  ', state }]) {
      const response = await POST(new Request('http://localhost', {
        method: 'POST', body: JSON.stringify(payload),
      }), { params: Promise.resolve({ sessionId: 'session-1' }) });
      expect(response.status).toBe(400);
    }
    expect(appendPracticeRevision).not.toHaveBeenCalled();
  });

  it('saves every supported language draft without trusting a stale active map entry', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    appendPracticeRevision.mockResolvedValue({ revision: { revisionNumber: 1 } });
    const workspace = {
      draft: '', mode: 'text', language: 'python', code: 'def answer():\n    return 7',
      codeChecked: false, completed: false, evaluation: null, codeGrade: null,
      codeDraftVersion: 1, codeByLanguage: { python: 'stale copy', cpp: 'int answer() { return 7; }', typescript: 'const answer = () => 7;' },
    };
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', {
      method: 'POST', body: JSON.stringify({ draft: '', state: workspace }),
    }), { params: Promise.resolve({ sessionId: 'session-1' }) });
    expect(response.status).toBe(201);
    expect(appendPracticeRevision).toHaveBeenCalledWith(expect.objectContaining({ workspaceState: {
      ...workspace, codeByLanguage: { ...workspace.codeByLanguage, python: workspace.code },
    } }));
  });

  it('rejects unsupported and oversized language drafts before writing', async () => {
    getPracticeOwner.mockResolvedValue({ kind: 'user', id: 'user-1' });
    const { POST } = await import('./route');
    const workspace = {
      draft: '', mode: 'text', language: 'python', code: 'pass',
      codeChecked: false, completed: false, evaluation: null, codeGrade: null, codeDraftVersion: 1,
    };
    for (const codeByLanguage of [{ ruby: 'puts 7' }, { cpp: 7 }, { cpp: 'é'.repeat(50_001) }]) {
      const response = await POST(new Request('http://localhost', {
        method: 'POST', body: JSON.stringify({ draft: '', state: { ...workspace, codeByLanguage } }),
      }), { params: Promise.resolve({ sessionId: 'session-1' }) });
      expect(response.status).toBe(400);
    }
    expect(appendPracticeRevision).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRemotePracticeSession, syncPracticeSession } from './practice-sync';
import { readPracticeCache } from './practice-cache';

let scope: string;
beforeEach(() => { scope = `guest:${crypto.randomUUID()}`; });

const state = {
  draft: 'Use a map.',
  mode: 'text' as const,
  language: 'python' as const,
  code: 'def solve():\n    pass',
  codeChecked: false,
  completed: false,
  evaluation: null,
  codeGrade: null,
};

describe('practice synchronization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries a lost response with the same receipt before sending newer work', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ session: { id: 'session-retry', revision: 1 } }))
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(Response.json({ revision: { revisionNumber: 1 } }))
      .mockResolvedValueOnce(Response.json({ revision: { revisionNumber: 2 } }));
    vi.stubGlobal('fetch', fetch);
    const payload = { scope, contentId: 'pair-with-target-v1', draft: state.draft, currentStage: 'plan' as const, state };
    await expect(syncPracticeSession(payload)).rejects.toThrow('lost response');
    const first = JSON.parse(fetch.mock.calls[1][1].body);
    expect(readPracticeCache(payload.contentId, scope)?.pending?.requestKey).toBe(first.requestKey);
    const changed = { ...state, draft: 'A newer plan.' };
    await expect(syncPracticeSession({ ...payload, draft: changed.draft, state: changed })).resolves.toMatchObject({ status: 'saved', revisionNumber: 2 });
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(first);
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toMatchObject({ expectedRevisionNumber: 1, draft: changed.draft });
    expect(JSON.parse(fetch.mock.calls[3][1].body).requestKey).not.toBe(first.requestKey);
  });

  it('serializes overlapping saves and advances only from the acknowledged base', async () => {
    let release!: (response: Response) => void;
    const held = new Promise<Response>(resolve => { release = resolve; });
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ session: { id: 'session-serial', revision: 1 } }))
      .mockReturnValueOnce(held)
      .mockResolvedValueOnce(Response.json({ revision: { revisionNumber: 2 } }));
    vi.stubGlobal('fetch', fetch);
    const payload = { scope, contentId: 'pair-with-target-v1', draft: state.draft, currentStage: 'plan' as const, state };
    const first = syncPracticeSession(payload);
    const second = syncPracticeSession({ ...payload, draft: 'Second edit.', state: { ...state, draft: 'Second edit.' } });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    release(Response.json({ revision: { revisionNumber: 1 } }));
    await first;
    await expect(second).resolves.toMatchObject({ revisionNumber: 2 });
    expect(JSON.parse(fetch.mock.calls[2][1].body).expectedRevisionNumber).toBe(1);
  });

  it('does not overwrite remote work without an acknowledged base', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ session: {
      id: 'session-other-device', revision: 8, latestRevisionNumber: 3, sessionMetadata: { workspaceState: { ...state, draft: 'Other device plan.' } },
    } }));
    vi.stubGlobal('fetch', fetch);
    await expect(syncPracticeSession({ scope, contentId: 'pair-with-target-v1', draft: state.draft, currentStage: 'plan', state }))
      .resolves.toMatchObject({ status: 'conflict' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readPracticeCache('pair-with-target-v1', scope)?.conflict?.state?.draft).toBe('Other device plan.');
  });

  it('stops a save when the authenticated owner changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'owner_changed' }, { status: 409 })));
    await expect(syncPracticeSession({ scope, contentId: 'pair-with-target-v1', draft: state.draft, currentStage: 'plan', state }))
      .rejects.toThrow('account changed');
  });

  it('persists the complete workspace state with a revision', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 'session-1', revision: 1 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: { revisionNumber: 2 } }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);

    await expect(syncPracticeSession({ scope, contentId: 'pair-with-target-v1', draft: state.draft, currentStage: 'plan', state })).resolves.toEqual({
      sessionId: 'session-1', revisionNumber: 2, status: 'saved',
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ draft: state.draft, currentStage: 'plan', state, expectedRevisionNumber: 0, requestKey: expect.any(String) });
    expect(fetch.mock.calls[1][1].headers['x-practice-owner']).toBe(scope);
  });

  it('restores full state and the exact persisted draft revision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: {
        id: 'session-1',
        revision: 8,
        latestRevisionNumber: 7,
        sessionMetadata: { draft: state.draft, workspaceState: state },
      },
    }), { status: 200 })));

    await expect(loadRemotePracticeSession('pair-with-target-v1', scope)).resolves.toEqual({
      sessionId: 'session-1', revision: 8, latestRevisionNumber: 7, state, draft: state.draft,
    });
  });

  it('falls back to the durable draft when older sessions have no workspace state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: { id: 'session-1', revision: 3, latestRevisionNumber: 2, sessionMetadata: { draft: 'Older draft' } },
    }), { status: 200 })));

    await expect(loadRemotePracticeSession('pair-with-target-v1', scope)).resolves.toMatchObject({
      state: null, draft: 'Older draft', latestRevisionNumber: 2,
    });
  });

  it('round-trips coding-only feedback and completion through account workspace state', async () => {
    const codingState = {
      ...state, draft: '', codeChecked: true, completed: true,
      codeGrade: {
        problemId: 'pair-with-target-v1', version: 'code-grading-v1', passed: true,
        passedCount: 1, totalCount: 1, tests: [{ name: 'sample case', passed: true }],
      },
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ session: { id: 'session-1', revision: 1 } }))
      .mockResolvedValueOnce(Response.json({ revision: { revisionNumber: 2 } }))
      .mockResolvedValueOnce(Response.json({ session: {
        id: 'session-1', revision: 2, latestRevisionNumber: 2,
        sessionMetadata: { draft: '', workspaceState: codingState },
      } }));
    vi.stubGlobal('fetch', fetch);

    await expect(syncPracticeSession({ scope, contentId: 'pair-with-target-v1', draft: '', currentStage: 'evaluate', state: codingState }))
      .resolves.toMatchObject({ status: 'saved', revisionNumber: 2 });
    expect(JSON.parse(fetch.mock.calls[1][1].body).state).toEqual(codingState);
    await expect(loadRemotePracticeSession('pair-with-target-v1', scope)).resolves.toMatchObject({ state: codingState, draft: '' });
  });
});

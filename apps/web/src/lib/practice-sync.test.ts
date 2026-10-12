import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRemotePracticeSession, syncPracticeSession } from './practice-sync';

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

  it('persists the complete workspace state with a revision', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: { id: 'session-1', revision: 1 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: { revisionNumber: 2 } }), { status: 201 }));
    vi.stubGlobal('fetch', fetch);

    await expect(syncPracticeSession({ contentId: 'pair-with-target-v1', draft: state.draft, currentStage: 'plan', state })).resolves.toEqual({
      sessionId: 'session-1', revisionNumber: 2, status: 'saved',
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ draft: state.draft, currentStage: 'plan', state });
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

    await expect(loadRemotePracticeSession('pair-with-target-v1')).resolves.toEqual({
      sessionId: 'session-1', revision: 8, latestRevisionNumber: 7, state, draft: state.draft,
    });
  });

  it('falls back to the durable draft when older sessions have no workspace state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      session: { id: 'session-1', revision: 3, latestRevisionNumber: 2, sessionMetadata: { draft: 'Older draft' } },
    }), { status: 200 })));

    await expect(loadRemotePracticeSession('pair-with-target-v1')).resolves.toMatchObject({
      state: null, draft: 'Older draft', latestRevisionNumber: 2,
    });
  });
});

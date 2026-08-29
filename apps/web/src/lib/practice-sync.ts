import { serializePracticeSession, type PracticeSessionState } from './practice-session';

export type PracticeSyncStatus = 'ready' | 'saving' | 'saved' | 'offline' | 'conflict';

export type PracticeSyncPayload = {
  contentId: string;
  draft: string;
  currentStage: 'understand' | 'match' | 'plan' | 'implement' | 'evaluate';
  state: PracticeSessionState;
  sessionId?: string;
};

export type PracticeSyncResult = {
  sessionId: string;
  revisionNumber: number;
  status: PracticeSyncStatus;
};

const practiceSessionCacheKey = (contentId: string) => `method:${contentId}:remote-session`;

export const readCachedPracticeSessionId = (contentId: string) => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(practiceSessionCacheKey(contentId));
};

export const writeCachedPracticeSessionId = (contentId: string, sessionId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(practiceSessionCacheKey(contentId), sessionId);
};

export const clearCachedPracticeSessionId = (contentId: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(practiceSessionCacheKey(contentId));
};

export async function syncPracticeSession(payload: PracticeSyncPayload): Promise<PracticeSyncResult> {
  const started = await fetch('/api/practice/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentId: payload.contentId }),
  });

  if (!started.ok) {
    if (started.status === 401) {
      return { sessionId: payload.sessionId ?? '', revisionNumber: 0, status: 'offline' };
    }

    throw new Error('Unable to create practice session');
  }

  const startedBody = (await started.json()) as {
    session: { id: string; revision: number };
  };

  const sessionId = startedBody.session.id;
  writeCachedPracticeSessionId(payload.contentId, sessionId);

  const revisionResponse = await fetch(`/api/practice/sessions/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft: payload.draft, currentStage: payload.currentStage }),
  });

  if (revisionResponse.status === 409) {
    return { sessionId, revisionNumber: startedBody.session.revision, status: 'conflict' };
  }

  if (!revisionResponse.ok) {
    if (revisionResponse.status === 401) {
      return { sessionId, revisionNumber: startedBody.session.revision, status: 'offline' };
    }

    throw new Error('Unable to sync practice revision');
  }

  const revisionBody = (await revisionResponse.json()) as {
    revision: { revisionNumber: number };
  };

  return {
    sessionId,
    revisionNumber: revisionBody.revision.revisionNumber,
    status: 'saved',
  };
}

export const serializePracticeSessionForCache = (state: PracticeSessionState) => serializePracticeSession(state);

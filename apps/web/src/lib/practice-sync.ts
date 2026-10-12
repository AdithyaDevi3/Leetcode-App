import { deserializePracticeSession, serializePracticeSession, type PracticeSessionState } from './practice-session';
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from './safe-browser-storage';

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

export type RemotePracticeSession = {
  sessionId: string;
  revision: number;
  latestRevisionNumber: number | null;
  state: PracticeSessionState | null;
  draft: string | null;
};

const practiceSessionCacheKey = (contentId: string) => `method:${contentId}:remote-session`;

export const readCachedPracticeSessionId = (contentId: string) => {
  return readBrowserStorage(practiceSessionCacheKey(contentId));
};

export const writeCachedPracticeSessionId = (contentId: string, sessionId: string) => {
  writeBrowserStorage(practiceSessionCacheKey(contentId), sessionId);
};

export const clearCachedPracticeSessionId = (contentId: string) => {
  removeBrowserStorage(practiceSessionCacheKey(contentId));
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
    body: JSON.stringify({ draft: payload.draft, currentStage: payload.currentStage, state: payload.state }),
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

export async function loadRemotePracticeSession(contentId: string): Promise<RemotePracticeSession | null> {
  const response = await fetch(`/api/practice/sessions?contentId=${encodeURIComponent(contentId)}`);
  if (!response.ok) return null;
  const body = await response.json() as {
    session?: { id?: unknown; revision?: unknown; latestRevisionNumber?: unknown; sessionMetadata?: unknown };
  };
  if (!body.session || typeof body.session.id !== 'string' || typeof body.session.revision !== 'number') return null;
  const metadata = body.session.sessionMetadata && typeof body.session.sessionMetadata === 'object'
    ? body.session.sessionMetadata as Record<string, unknown>
    : {};
  const state = metadata.workspaceState === undefined
    ? null
    : deserializePracticeSession(JSON.stringify(metadata.workspaceState));
  const draft = state?.draft ?? (typeof metadata.draft === 'string' ? metadata.draft : null);
  writeCachedPracticeSessionId(contentId, body.session.id);
  return {
    sessionId: body.session.id,
    revision: body.session.revision,
    latestRevisionNumber: typeof body.session.latestRevisionNumber === 'number' ? body.session.latestRevisionNumber : null,
    state,
    draft,
  };
}

export const serializePracticeSessionForCache = (state: PracticeSessionState) => serializePracticeSession(state);

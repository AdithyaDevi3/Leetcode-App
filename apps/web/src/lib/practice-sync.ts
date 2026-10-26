import { serializePracticeSession, type PracticeSessionState } from './practice-session';
import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from './safe-browser-storage';
import { readPracticeVerification, restoreVerifiedWorkspace, type PracticeVerificationSnapshot } from './practice-verification-state';
import { readPracticeCache, writePracticeCache, type PendingPracticeSave, type PracticeCache } from './practice-cache';

export type PracticeSyncStatus = 'ready' | 'saving' | 'saved' | 'offline' | 'conflict';
export type PracticeSyncPayload = {
  contentId: string; scope: string; draft: string;
  currentStage: PendingPracticeSave['currentStage']; state: PracticeSessionState;
};
export type PracticeSyncResult = { sessionId: string; revisionNumber: number; status: PracticeSyncStatus };
export type RemotePracticeSession = {
  sessionId: string; revision: number; latestRevisionNumber: number | null;
  state: PracticeSessionState | null; draft: string | null; verification?: PracticeVerificationSnapshot;
};
const practiceSessionCacheKey = (contentId: string, scope: string) => `method:${scope}:${contentId}:remote-session`;
export const readCachedPracticeSessionId = (contentId: string, scope: string) => readBrowserStorage(practiceSessionCacheKey(contentId, scope))
  ?? readPracticeCache(contentId, scope)?.base?.sessionId ?? readPracticeCache(contentId, scope)?.pending?.sessionId ?? null;
export const writeCachedPracticeSessionId = (contentId: string, sessionId: string, scope: string) => writeBrowserStorage(practiceSessionCacheKey(contentId, scope), sessionId);
export const clearCachedPracticeSessionId = (contentId: string, scope: string) => removeBrowserStorage(practiceSessionCacheKey(contentId, scope));
const headersFor = (scope: string) => ({ 'Content-Type': 'application/json', 'x-practice-owner': scope });

async function checkOwner(response: Response) {
  if (response.status !== 409) return;
  const body = await response.clone().json().catch(() => null) as { code?: string } | null;
  if (body?.code === 'owner_changed') {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('practice-owner-changed'));
    throw new Error('Your account changed. Your earlier draft remains in its own workspace.');
  }
}
function remoteSession(body: { session?: { id?: unknown; revision?: unknown; latestRevisionNumber?: unknown; sessionMetadata?: unknown } }, contentId: string): RemotePracticeSession | null {
  if (!body.session || typeof body.session.id !== 'string' || typeof body.session.revision !== 'number') return null;
  const metadata = body.session.sessionMetadata && typeof body.session.sessionMetadata === 'object' ? body.session.sessionMetadata as Record<string, unknown> : {};
  const state = restoreVerifiedWorkspace(metadata, contentId);
  const verification = readPracticeVerification(metadata.verification, contentId);
  return { sessionId: body.session.id, revision: body.session.revision,
    latestRevisionNumber: typeof body.session.latestRevisionNumber === 'number' ? body.session.latestRevisionNumber : null,
    state, draft: state?.draft ?? (typeof metadata.draft === 'string' ? metadata.draft : null),
    ...(verification ? { verification } : {}),
  };
}
export async function loadRemotePracticeSession(contentId: string, scope: string): Promise<RemotePracticeSession | null> {
  if (scope === 'device') return null;
  const response = await fetch(`/api/practice/sessions?contentId=${encodeURIComponent(contentId)}`, { headers: headersFor(scope), cache: 'no-store', signal: AbortSignal.timeout(8_000) });
  await checkOwner(response);
  if (!response.ok) return null;
  const remote = remoteSession(await response.json(), contentId);
  if (remote) writeCachedPracticeSessionId(contentId, remote.sessionId, scope);
  return remote;
}

const queues = new Map<string, Promise<PracticeSyncResult>>();
export function syncPracticeSession(payload: PracticeSyncPayload): Promise<PracticeSyncResult> {
  const key = `${payload.scope}:${payload.contentId}`;
  const previous = queues.get(key);
  const next = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() => syncNow(payload));
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
  return next;
}
async function syncNow(payload: PracticeSyncPayload): Promise<PracticeSyncResult> {
  const { contentId, scope } = payload;
  if (scope === 'device') return { sessionId: '', revisionNumber: 0, status: 'offline' };
  const read = () => readPracticeCache(contentId, scope) ?? { version: 2 as const, state: payload.state, base: null };
  const patch = (changes: Partial<PracticeCache>) => {
    const updated = { ...read(), ...changes };
    writePracticeCache(contentId, scope, updated);
    return updated;
  };
  const conflict = async (sessionId: string, revisionNumber: number): Promise<PracticeSyncResult> => {
    const remote = await loadRemotePracticeSession(contentId, scope);
    if (remote) patch({ conflict: remote });
    return { sessionId, revisionNumber, status: 'conflict' };
  };
  let cache = read();
  if (cache.conflict) return { sessionId: cache.conflict.sessionId, revisionNumber: cache.conflict.latestRevisionNumber ?? 0, status: 'conflict' };
  if (!cache.base && !cache.pending) {
    const response = await fetch('/api/practice/sessions', { method: 'POST', headers: headersFor(scope), body: JSON.stringify({ contentId }), signal: AbortSignal.timeout(15_000) });
    await checkOwner(response);
    if (!response.ok) return { sessionId: '', revisionNumber: 0, status: 'offline' };
    const remote = remoteSession(await response.json(), contentId);
    if (!remote) throw new Error('Unable to open practice session');
    writeCachedPracticeSessionId(contentId, remote.sessionId, scope);
    if (remote.state || remote.draft) {
      patch({ conflict: remote });
      return { sessionId: remote.sessionId, revisionNumber: remote.latestRevisionNumber ?? 0, status: 'conflict' };
    }
    cache = patch({ base: { sessionId: remote.sessionId, revisionNumber: remote.latestRevisionNumber ?? 0, state: remote.state } });
  }
  const send = async (pending: PendingPracticeSave): Promise<PracticeSyncResult> => {
    const response = await fetch(`/api/practice/sessions/${pending.sessionId}`, { method: 'POST', headers: headersFor(scope), signal: AbortSignal.timeout(15_000), body: JSON.stringify({
      draft: pending.draft, currentStage: pending.currentStage, state: pending.state,
      expectedRevisionNumber: pending.expectedRevisionNumber, requestKey: pending.requestKey,
    }) });
    await checkOwner(response);
    if (response.status === 409) return conflict(pending.sessionId, pending.expectedRevisionNumber);
    if (!response.ok) throw new Error('Unable to sync practice revision');
    const body = await response.json() as { revision: { revisionNumber: number } };
    if (!Number.isSafeInteger(body.revision?.revisionNumber)) throw new Error('Invalid save receipt');
    patch({ pending: undefined, base: { sessionId: pending.sessionId, revisionNumber: body.revision.revisionNumber, state: pending.state } });
    writeCachedPracticeSessionId(contentId, pending.sessionId, scope);
    return { sessionId: pending.sessionId, revisionNumber: body.revision.revisionNumber, status: 'saved' };
  };
  if (cache.pending) {
    const result = await send(cache.pending);
    if (result.status !== 'saved' || serializePracticeSession(cache.pending.state) === serializePracticeSession(payload.state)) return result;
  }
  cache = read();
  if (!cache.base) throw new Error('Practice save base is unavailable');
  if (cache.base.state && serializePracticeSession(cache.base.state) === serializePracticeSession(payload.state)) {
    return { sessionId: cache.base.sessionId, revisionNumber: cache.base.revisionNumber, status: 'saved' };
  }
  const pending: PendingPracticeSave = {
    requestKey: crypto.randomUUID(), expectedRevisionNumber: cache.base.revisionNumber, sessionId: cache.base.sessionId,
    draft: payload.draft, currentStage: payload.currentStage, state: payload.state,
  };
  patch({ pending });
  return send(pending);
}
export const serializePracticeSessionForCache = (state: PracticeSessionState) => serializePracticeSession(state);

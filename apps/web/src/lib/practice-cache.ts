import { deserializePracticeSession, type PracticeSessionState } from './practice-session';
import { readBrowserStorage, writeBrowserStorage } from './safe-browser-storage';
import type { RemotePracticeSession } from './practice-sync';

export type PracticeSaveBase = { sessionId: string; revisionNumber: number; state: PracticeSessionState | null };
export type PendingPracticeSave = {
  requestKey: string; expectedRevisionNumber: number; sessionId: string;
  draft: string; currentStage: 'understand' | 'match' | 'plan' | 'implement' | 'evaluate'; state: PracticeSessionState;
};
export type PracticeCache = {
  version: 2; state: PracticeSessionState; base: PracticeSaveBase | null;
  pending?: PendingPracticeSave; conflict?: RemotePracticeSession; recovery?: PracticeSessionState;
};
export const practiceCacheKey = (contentId: string, scope: string) => `method:${scope}:${contentId}:workspace-v2`;
// Each tab keeps its own acknowledged base; another tab cannot silently advance it.
const memory = new Map<string, PracticeCache>();
let tabId: string | null = null;
function tabCacheKey(key: string): string {
  if (typeof window === 'undefined') return `${key}:tab:server`;
  if (!tabId) {
    try {
      tabId = window.sessionStorage.getItem('method:practice-tab') || crypto.randomUUID();
      window.sessionStorage.setItem('method:practice-tab', tabId);
    } catch { tabId = crypto.randomUUID(); }
  }
  return `${key}:tab:${tabId}`;
}
export function readPracticeCache(contentId: string, scope: string): PracticeCache | null {
  const key = practiceCacheKey(contentId, scope);
  if (memory.has(key)) return memory.get(key)!;
  try {
    const raw = readBrowserStorage(tabCacheKey(key)) ?? readBrowserStorage(key);
    if (!raw) return null;
    const cache = JSON.parse(raw) as PracticeCache;
    const state = deserializePracticeSession(JSON.stringify(cache.state));
    if (cache.version !== 2 || !state) return null;
    const base = cache.base;
    if (base && (typeof base.sessionId !== 'string' || !Number.isSafeInteger(base.revisionNumber) || base.revisionNumber < 0)) return null;
    const pending = cache.pending;
    if (pending && (typeof pending.requestKey !== 'string' || typeof pending.sessionId !== 'string'
      || !Number.isSafeInteger(pending.expectedRevisionNumber) || !deserializePracticeSession(JSON.stringify(pending.state)))) return null;
    const parsed = { ...cache, state };
    memory.set(key, parsed);
    return parsed;
  } catch { return null; }
}
export function writePracticeCache(contentId: string, scope: string, cache: PracticeCache, options: { share?: boolean } = {}): boolean {
  const key = practiceCacheKey(contentId, scope);
  memory.set(key, cache);
  const serialized = JSON.stringify(cache);
  const ownSaved = writeBrowserStorage(tabCacheKey(key), serialized);
  const sharedSaved = options.share === false ? false : writeBrowserStorage(key, serialized);
  return ownSaved || sharedSaved;
}
export const samePracticeWork = (a: PracticeSessionState | null, b: PracticeSessionState | null) =>
  a?.draft === b?.draft && a?.code === b?.code && a?.language === b?.language && a?.mode === b?.mode;

/** Reconcile editable work; grading projections can change independently of a draft. */
export function reconcilePracticeCache(local: PracticeCache | null, remote: RemotePracticeSession): 'local' | 'remote' | 'conflict' {
  if (!local) return 'remote';
  if (local.pending) return 'local'; // Replay the exact pending receipt before advancing the base.
  if (!remote.state && !remote.draft) return 'local';
  if (samePracticeWork(local.state, remote.state)) return 'local';
  if (local.base && samePracticeWork(local.state, local.base.state)) return 'remote';
  if (local.base?.sessionId === remote.sessionId && local.base.revisionNumber === (remote.latestRevisionNumber ?? 0)) return 'local';
  return 'conflict';
}

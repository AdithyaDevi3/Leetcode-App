'use client';

import { useEffect, useRef, useState } from 'react';
import { deserializePracticeSession, serializePracticeSession, sessionStorageKey, type PracticeSessionState } from './practice-session';
import { practiceCacheKey, readPracticeCache, writePracticeCache, reconcilePracticeCache } from './practice-cache';
import { loadRemotePracticeSession, syncPracticeSession, type PracticeSyncStatus, type RemotePracticeSession } from './practice-sync';
import { restoreVerifiedWorkspace } from './practice-verification-state';
import { readBrowserStorage } from './safe-browser-storage';

export function usePracticePersistence(input: {
  scope: string; contentId: string; state: PracticeSessionState; enabled: boolean; hasWork: boolean;
  generation: { current: number };
  restore: (state: PracticeSessionState) => void;
  status: (label: string, status: PracticeSyncStatus, revision?: number) => void;
}) {
  const { contentId, scope, enabled, state, hasWork, status: reportStatus } = input;
  const key = practiceCacheKey(contentId, scope);
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });
  const [opened, setOpened] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [conflict, setConflict] = useState<RemotePracticeSession | null>(null);
  const [recovery, setRecovery] = useState<PracticeSessionState | null>(null);
  const [legacy, setLegacy] = useState<PracticeSessionState | null>(null);
  const [deviceDraft, setDeviceDraft] = useState<PracticeSessionState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      const local = readPracticeCache(contentId, scope);
      if (local) latest.current.restore(local.state);
      setConflict(local?.conflict ?? null);
      setRecovery(local?.recovery ?? null);
      const old = readBrowserStorage(sessionStorageKey(contentId));
      setLegacy(old ? deserializePracticeSession(old) : null);
      setDeviceDraft(scope === 'device' ? null : readPracticeCache(contentId, 'device')?.state ?? null);
      setOpened(key);
      latest.current.status(local ? 'Restored locally' : 'Ready', local ? 'offline' : 'ready');
    }, 0);
    const onRefresh = () => setRefresh(value => value + 1);
    const onStorage = (event: StorageEvent) => { if (event.key === key) onRefresh(); };
    window.addEventListener('online', onRefresh);
    window.addEventListener('focus', onRefresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', onRefresh);
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [contentId, scope, key, enabled]);

  useEffect(() => {
    if (!enabled || opened !== key) return;
    let current = true;
    const initialState = latest.current.state;
    const generation = latest.current.generation.current;
    void loadRemotePracticeSession(contentId, scope).then(remote => {
      if (!current || latest.current.contentId !== contentId || latest.current.generation.current !== generation) return;
      const state = latest.current.state;
      let local = readPracticeCache(contentId, scope);
      if (!local && serializePracticeSession(state) !== serializePracticeSession(initialState)) {
        local = { version: 2, state, base: null };
      }
      if (!remote) return;
      const decision = local?.conflict ? 'conflict' : reconcilePracticeCache(local, remote);
      const remoteState = remote.state ?? { ...state, draft: remote.draft ?? '' };
      const base = { sessionId: remote.sessionId, revisionNumber: remote.latestRevisionNumber ?? 0, state: remote.state };
      if (decision === 'conflict' && local) {
        const preserved = restoreVerifiedWorkspace({ workspaceState: state, verification: remote.verification }, contentId) ?? state;
        writePracticeCache(contentId, scope, { ...local, state: preserved, conflict: remote }, { share: false });
        latest.current.restore(preserved);
        setConflict(remote);
        latest.current.status('Conflict', 'conflict');
        return;
      }
      if (decision === 'remote') {
        // Empty remote sessions must not replace the selected activity's starter code.
        const restored = remote.state || remote.draft ? remoteState : state;
        writePracticeCache(contentId, scope, { version: 2, state: restored, base: { ...base, state: restored }, recovery: local?.recovery }, { share: false });
        latest.current.restore(restored);
        latest.current.status(remote.state || remote.draft ? 'Restored from account' : 'Ready', remote.state || remote.draft ? 'saved' : 'ready', base.revisionNumber);
      } else if (local) {
        const restored = restoreVerifiedWorkspace({ workspaceState: state, verification: remote.verification }, contentId) ?? state;
        writePracticeCache(contentId, scope, { ...local, state: restored, base: local.pending ? local.base : base }, { share: false });
        latest.current.restore(restored);
        latest.current.status('Restored locally', 'offline', local.pending ? local.base?.revisionNumber : base.revisionNumber);
      }
    }).catch(() => {
      // The scoped local draft and any pending receipt remain available offline.
    }).finally(() => { if (current) setChecked(key); });
    return () => { current = false; };
  }, [contentId, scope, key, enabled, opened, refresh]);

  useEffect(() => {
    if (!enabled || opened !== key) return;
    const cache = readPracticeCache(contentId, scope);
    if (!cache && !hasWork) return;
    const changed = !cache || serializePracticeSession(cache.state) !== serializePracticeSession(state);
    const saved = writePracticeCache(contentId, scope, { version: 2, base: null, ...cache, state }, { share: changed });
    let current = true;
    const timer = window.setTimeout(() => {
      const updated = readPracticeCache(contentId, scope)!;
      if (updated.conflict) { setConflict(updated.conflict); reportStatus('Conflict', 'conflict'); return; }
      if (checked !== key) return;
      if (updated.base?.state && serializePracticeSession(updated.base.state) === serializePracticeSession(state) && !updated.pending) {
        reportStatus('Saved to server', 'saved', updated.base.revisionNumber);
        return;
      }
      // Default starter code alone does not create a new saved attempt.
      if (!hasWork && !updated.pending) return;
      reportStatus(saved ? 'Saving' : 'Session active', 'saving');
      void syncPracticeSession({ contentId, scope, draft: state.draft, currentStage: state.completed ? 'evaluate' : 'plan', state })
        .then(result => {
          if (!current) return;
          const next = readPracticeCache(contentId, scope);
          if (result.status === 'conflict') setConflict(next?.conflict ?? null);
          reportStatus(result.status === 'saved' ? 'Saved to server' : result.status === 'conflict' ? 'Conflict' : 'Offline draft', result.status, result.revisionNumber);
        }).catch(() => { if (current) reportStatus('Offline draft', 'offline'); });
    }, 450);
    return () => { current = false; window.clearTimeout(timer); };
  }, [contentId, scope, key, enabled, opened, checked, refresh, state, reportStatus, hasWork]);

  const resolve = (choice: 'local' | 'remote') => {
    if (!conflict) { setRefresh(value => value + 1); return; }
    const state = latest.current.state;
    const remoteState = conflict.state ?? { ...state, draft: conflict.draft ?? '' };
    const chosen = choice === 'remote' ? remoteState : state;
    const other = choice === 'remote' ? state : remoteState;
    writePracticeCache(contentId, scope, { version: 2, state: chosen,
      base: { sessionId: conflict.sessionId, revisionNumber: conflict.latestRevisionNumber ?? 0, state: remoteState }, recovery: other });
    setRecovery(other);
    setConflict(null);
    latest.current.restore(chosen);
    latest.current.status(choice === 'remote' ? 'Restored from account' : 'Saving', choice === 'remote' ? 'saved' : 'saving', conflict.latestRevisionNumber ?? 0);
    setRefresh(value => value + 1);
  };
  const restoreCopy = (state: PracticeSessionState) => {
    const cache = readPracticeCache(contentId, scope);
    const previous = latest.current.state;
    writePracticeCache(contentId, scope, { version: 2, base: null, ...cache, state, recovery: previous });
    latest.current.restore(state);
    setRecovery(previous);
    setRefresh(value => value + 1);
  };
  return { conflict, recovery, legacy, deviceDraft, resolve, restoreCopy, retry: () => setRefresh(value => value + 1) };
}

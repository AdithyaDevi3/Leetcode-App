import { describe, expect, it } from 'vitest';
import { practiceCacheKey, readPracticeCache, writePracticeCache, reconcilePracticeCache, type PracticeCache } from './practice-cache';
import type { PracticeSessionState } from './practice-session';
const state: PracticeSessionState = { draft: 'Base approach.', mode: 'text', language: 'python', code: 'pass', codeChecked: false, completed: false, evaluation: null, codeGrade: null };
const remote = { sessionId: 'session-1', revision: 5, latestRevisionNumber: 2, state, draft: state.draft };
const local: PracticeCache = { version: 2, state, base: { sessionId: 'session-1', revisionNumber: 2, state } };

describe('owner-scoped practice recovery', () => {
  it('separates users, guests, and unauthenticated device work even without storage', () => {
    const content = crypto.randomUUID();
    writePracticeCache(content, 'user:one', local);
    writePracticeCache(content, 'user:two', { ...local, state: { ...state, draft: 'Second account.' } });
    expect(readPracticeCache(content, 'user:one')?.state.draft).toBe(state.draft);
    expect(readPracticeCache(content, 'user:two')?.state.draft).toBe('Second account.');
    expect(readPracticeCache(content, 'guest:one')).toBeNull();
    expect(practiceCacheKey(content, 'device')).not.toBe(practiceCacheKey(content, 'user:one'));
  });
  it('adopts a second-device update when the local copy is unchanged', () => {
    expect(reconcilePracticeCache(local, { ...remote, latestRevisionNumber: 3, state: { ...state, draft: 'Updated elsewhere.' } })).toBe('remote');
  });
  it('keeps unsaved local changes when the server base is unchanged', () => {
    expect(reconcilePracticeCache({ ...local, state: { ...state, draft: 'Local edit.' } }, remote)).toBe('local');
  });
  it('preserves both versions when local and remote changed independently', () => {
    expect(reconcilePracticeCache({ ...local, state: { ...state, draft: 'Local edit.' } }, { ...remote, latestRevisionNumber: 3, state: { ...state, draft: 'Remote edit.' } })).toBe('conflict');
    expect(reconcilePracticeCache({ ...local, base: null }, { ...remote, state: { ...state, code: 'different source' } })).toBe('conflict');
  });
  it('replays an unresolved receipt before treating a newer revision as a conflict', () => {
    expect(reconcilePracticeCache({ ...local, pending: { requestKey: 'retry-1', sessionId: 'session-1', expectedRevisionNumber: 2, draft: state.draft, currentStage: 'plan', state } }, { ...remote, latestRevisionNumber: 3 })).toBe('local');
  });
});

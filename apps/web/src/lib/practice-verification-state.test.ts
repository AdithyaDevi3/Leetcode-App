import { describe, expect, it } from 'vitest';
import { readPracticeVerification, restoreVerifiedWorkspace } from './practice-verification-state';

const snapshot = {
  requestId: 'verification-1', language: 'python', source: 'def find_pair(values, target): return [0, 1]',
  grade: { problemId: 'pair-with-target-v1', version: 'test-version', passed: true, passedCount: 1, totalCount: 1, tests: [{ name: 'sample', passed: true }] },
  verifiedAt: '2026-10-26T00:00:00.000Z',
};
const state = { draft: 'Keep my reasoning.', mode: 'blocks', language: 'python', code: snapshot.source, codeChecked: false, completed: false, evaluation: null, codeGrade: null };

describe('trusted verification restoration', () => {
  it('restores the submitted code and grade when browser autosave never ran', () => {
    expect(restoreVerifiedWorkspace({ verification: snapshot }, 'pair-with-target-v1')).toMatchObject({
      draft: '', language: 'python', code: snapshot.source, codeGrade: snapshot.grade, codeChecked: true, completed: true,
    });
  });

  it('restores the trusted grade over a stale matching workspace without replacing reasoning', () => {
    expect(restoreVerifiedWorkspace({ verification: snapshot, workspaceState: state }, 'pair-with-target-v1'))
      .toMatchObject({ ...state, codeGrade: snapshot.grade, codeChecked: true, completed: true });
  });

  it('preserves different code and clears unrelated completion claims', () => {
    const edited = { ...state, code: 'def find_pair(values, target): return []', codeGrade: snapshot.grade, codeChecked: true, completed: true };
    expect(restoreVerifiedWorkspace({ verification: snapshot, workspaceState: edited }, 'pair-with-target-v1'))
      .toMatchObject({ ...edited, codeGrade: null, codeChecked: false, completed: false });
  });

  it('ignores malformed or cross-activity verification data and preserves legacy drafts', () => {
    expect(readPracticeVerification(snapshot, 'other-activity')).toBeNull();
    expect(readPracticeVerification({ ...snapshot, grade: {} }, 'pair-with-target-v1')).toBeNull();
    expect(readPracticeVerification({ ...snapshot, language: 'ruby' }, 'pair-with-target-v1')).toBeNull();
    expect(readPracticeVerification({ ...snapshot, grade: { ...snapshot.grade, passedCount: 0 } }, 'pair-with-target-v1')).toBeNull();
    expect(restoreVerifiedWorkspace({ workspaceState: state }, 'pair-with-target-v1')).toEqual(state);
  });
});

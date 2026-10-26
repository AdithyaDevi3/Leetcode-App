import type { CodeGrade } from './code-grading';
import { deserializePracticeSession, type CodingLanguage, type PracticeSessionState } from './practice-session';

export type PracticeVerificationSnapshot = {
  requestId: string;
  source: string;
  language: CodingLanguage;
  grade: CodeGrade;
  verifiedAt: string;
};

/** Parse display data without importing the server-owned grading specifications. */
export function readPracticeVerification(value: unknown, problemId: string): PracticeVerificationSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PracticeVerificationSnapshot>;
  if (typeof candidate.requestId !== 'string' || typeof candidate.source !== 'string'
    || !['python', 'cpp', 'typescript'].includes(candidate.language ?? '')
    || typeof candidate.verifiedAt !== 'string' || !Number.isFinite(Date.parse(candidate.verifiedAt))) return null;
  const state = deserializePracticeSession(JSON.stringify({
    draft: '', mode: 'text', language: candidate.language, code: candidate.source,
    codeChecked: false, completed: false, evaluation: null, codeGrade: candidate.grade,
  }));
  const grade = state?.codeGrade;
  if (!grade || grade.problemId !== problemId || !grade.version.trim()
    || !Number.isInteger(grade.totalCount) || grade.totalCount < 1
    || !Number.isInteger(grade.passedCount) || grade.passedCount < 0 || grade.passedCount > grade.totalCount
    || grade.tests.length !== grade.totalCount
    || grade.tests.some(test => !test || typeof test.name !== 'string' || typeof test.passed !== 'boolean')
    || grade.tests.filter(test => test.passed).length !== grade.passedCount
    || grade.passed !== (grade.passedCount === grade.totalCount)) return null;
  return {
    requestId: candidate.requestId, source: candidate.source, language: state!.language,
    grade, verifiedAt: candidate.verifiedAt,
  };
}

export function restoreVerifiedWorkspace(metadata: Record<string, unknown>, problemId: string): PracticeSessionState | null {
  const state = metadata.workspaceState === undefined ? null
    : deserializePracticeSession(JSON.stringify(metadata.workspaceState));
  const verification = readPracticeVerification(metadata.verification, problemId);
  if (!verification) return state;
  if (state && (state.code !== verification.source || state.language !== verification.language)) {
    return { ...state, codeGrade: null, codeChecked: false, completed: false };
  }
  return {
    draft: typeof metadata.draft === 'string' ? metadata.draft : '', mode: 'text', evaluation: null,
    ...state,
    code: verification.source, language: verification.language,
    codeGrade: verification.grade, codeChecked: true, completed: verification.grade.passed,
  };
}

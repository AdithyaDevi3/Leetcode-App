import type { AssessmentWorkspace } from './assessment-author';
import type { AssessmentCopyCommand } from './assessment-copy-api-types';
import { assessmentUuid } from './assessment-draft-input';

export class AssessmentCopyInputError extends Error {}
const invalid = (): never => { throw new AssessmentCopyInputError('Choose a valid saved quiz, destination class and revision.'); };
export function assessmentCopyId(value: unknown): string {
  if (typeof value !== 'string' || !assessmentUuid.test(value)) return invalid();
  return value.toLowerCase();
}
export function parseAssessmentCopyQuery(request: Request, method: 'GET' | 'POST'): { workspace: AssessmentWorkspace; classId?: string } {
  const params = new URL(request.url).searchParams;
  const allowed = method === 'GET' ? ['workspace', 'classId'] : ['workspace'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return invalid();
  const workspace = params.get('workspace');
  if (workspace !== 'admin' && workspace !== 'teach') return invalid();
  return { workspace, ...(method === 'GET' ? { classId: assessmentCopyId(params.get('classId')) } : {}) };
}
export function parseAssessmentCopyRequest(value: unknown): AssessmentCopyCommand {
  const fields = ['sourceClassId', 'destinationClassId', 'expectedRevision', 'requestKey'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1
    || typeof input.requestKey !== 'string' || !input.requestKey.trim() || input.requestKey.length > 128) return invalid();
  return { sourceClassId: assessmentCopyId(input.sourceClassId), destinationClassId: assessmentCopyId(input.destinationClassId),
    expectedRevision: input.expectedRevision as number, requestKey: input.requestKey.trim() };
}

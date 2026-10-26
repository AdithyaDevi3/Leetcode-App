import type { AssessmentDraftInput } from '@leetcode-app/database';
import { freezeQuizQuestionSelection, type QuestionVersion } from '@leetcode-app/domain';

export const assessmentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class AssessmentInputError extends Error {}
const invalid = (message: string): never => { throw new AssessmentInputError(message); };
function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) return invalid('Unexpected assessment fields.');
  return value as Record<string, unknown>;
}
function text(value: unknown, minimum: number, maximum: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > maximum) return invalid(`${label} must be ${minimum}–${maximum} characters.`);
  return value.trim();
}
function timestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return invalid('Use a valid UTC date and time.');
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || ![date.toISOString(), date.toISOString().replace('.000Z', 'Z')].includes(value)) return invalid('Use a valid UTC date and time.');
  return date.toISOString();
}
export type AssessmentDraftRequest = { draftId: string | null; expectedRevision: number | null; requestKey: string; draft: AssessmentDraftInput };
export function parseAssessmentDraftRequest(value: unknown, findQuestion: (versionId: string) => QuestionVersion | null): AssessmentDraftRequest {
  const body = object(value, ['draftId', 'expectedRevision', 'requestKey', 'draft']);
  const draftId = body.draftId ?? null;
  const expectedRevision = body.expectedRevision ?? null;
  if (draftId !== null && (typeof draftId !== 'string' || !assessmentUuid.test(draftId))) return invalid('Choose a valid assessment draft.');
  if (draftId === null ? expectedRevision !== null : !Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) return invalid('A saved draft revision is required for editing.');
  const draft = object(body.draft, ['classId', 'title', 'instructions', 'questions', 'availableAt', 'dueAt', 'closesAt']);
  if (typeof draft.classId !== 'string' || !assessmentUuid.test(draft.classId)) return invalid('Choose a valid class.');
  if (!Array.isArray(draft.questions) || draft.questions.length < 1 || draft.questions.length > 30) return invalid('Select one to thirty questions.');
  const questions = draft.questions.map(value => {
    const selection = object(value, ['questionVersionId', 'maxUnits']);
    const question = typeof selection.questionVersionId === 'string' ? findQuestion(selection.questionVersionId) : null;
    if (!question || question.status !== 'reviewed') return invalid('A selected question is unavailable. Remove it and choose a reviewed question.');
    return { question, maxUnits: selection.maxUnits as number };
  });
  try { freezeQuizQuestionSelection(questions); } catch { return invalid('Select distinct reviewed questions with positive points, up to 10,000 points total.'); }
  const availableAt = timestamp(draft.availableAt), dueAt = timestamp(draft.dueAt), closesAt = timestamp(draft.closesAt);
  const dates = [availableAt, dueAt, closesAt].filter((date): date is string => date !== null);
  if (dates.some((date, index) => index > 0 && date < dates[index - 1])) return invalid('Opening, due, and closing times must be in that order.');
  return { draftId: draftId as string | null, expectedRevision: expectedRevision as number | null,
    requestKey: text(body.requestKey, 1, 128, 'Save key'),
    draft: {
      classId: draft.classId, title: text(draft.title, 3, 160, 'Title'), instructions: text(draft.instructions ?? '', 0, 2_000, 'Instructions'),
      questions: questions.map(({ question, maxUnits }) => ({ questionVersionId: question.versionId, maxUnits })), availableAt, dueAt, closesAt,
    },
  };
}

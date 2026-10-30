import type { DiagnosticAnswerDraft, DiagnosticSubmissionReceipt, DiagnosticView } from '@leetcode-app/database';

export const diagnosticUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const answerSignature = (answers: Record<string, string | null>) => JSON.stringify(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)));
export function diagnosticAnswers(view: Pick<DiagnosticView, 'questions'>, value: unknown): Record<string, string | null> | null {
  if (!record(value) || Object.keys(value).some(id => !view.questions.some(question => question.versionId === id))) return null;
  const entries: [string, string | null][] = [];
  for (const question of view.questions) {
    const selected = value[question.versionId] ?? null;
    if (selected !== null && (typeof selected !== 'string' || !question.options.some(option => option.id === selected))) return null;
    entries.push([question.versionId, selected]);
  }
  return Object.fromEntries(entries);
}
export function validDiagnosticDraft(view: Pick<DiagnosticView, 'questions'>, value: unknown): value is DiagnosticAnswerDraft {
  return record(value) && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
    && date(value.updatedAt) && diagnosticAnswers(view, value.answers) !== null;
}
export function validDiagnosticSubmission(id: string, value: unknown): value is DiagnosticSubmissionReceipt {
  return record(value) && value.diagnosticId === id && typeof value.requestKey === 'string' && diagnosticUuid.test(value.requestKey)
    && Number.isSafeInteger(value.answerRevision) && Number(value.answerRevision) >= 0 && date(value.submittedAt);
}
export function validDiagnostic(value: unknown): value is DiagnosticView {
  if (!record(value) || typeof value.id !== 'string' || !diagnosticUuid.test(value.id) || !date(value.createdAt)
    || typeof value.selectionVersion !== 'string' || !value.selectionVersion || !Array.isArray(value.questions) || value.questions.length !== 10) return false;
  const ids = new Set<string>();
  for (const question of value.questions) {
    if (!record(question) || typeof question.versionId !== 'string' || !/^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/.test(question.versionId)
      || ids.has(question.versionId) || question.kind !== 'multiple_choice' || typeof question.title !== 'string' || typeof question.prompt !== 'string'
      || !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) return false;
    ids.add(question.versionId);
    const options = new Set<string>();
    for (const option of question.options) {
      if (!record(option) || typeof option.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(option.id) || options.has(option.id) || typeof option.text !== 'string') return false;
      options.add(option.id);
    }
  }
  const view = value as unknown as DiagnosticView;
  if (!validDiagnosticDraft(view, value.answerDraft)) return false;
  if (value.submission === null) return value.feedback === null;
  if (!validDiagnosticSubmission(view.id, value.submission) || view.submission!.answerRevision !== view.answerDraft.revision) return false;
  const feedback = view.feedback;
  if (!feedback || feedback.totalQuestions !== 10 || !Array.isArray(feedback.items) || feedback.items.length !== 10) return false;
  const seen = new Set<string>();
  for (const item of feedback.items) {
    if (!record(item)) return false;
    const question = view.questions.find(question => question.versionId === item.questionVersionId);
    if (!question || seen.has(item.questionVersionId) || item.selectedOptionId !== (view.answerDraft.answers[question.versionId] ?? null)
      || !question.options.some(option => option.id === item.correctOptionId) || typeof item.correct !== 'boolean'
      || item.correct !== (item.selectedOptionId === item.correctOptionId) || typeof item.explanation !== 'string') return false;
    seen.add(item.questionVersionId);
  }
  return feedback.answeredCount === feedback.items.filter(item => item.selectedOptionId !== null).length
    && feedback.correctCount === feedback.items.filter(item => item.correct).length;
}

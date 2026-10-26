import { parseGradePoints } from '@leetcode-app/domain';
import type { AssessmentDraftInput, StoredAssessmentDraft } from '@leetcode-app/database';

export type AssessmentDraftForm = {
  title: string; instructions: string; availableAt: string; dueAt: string; closesAt: string;
  questions: { questionVersionId: string; points: string }[];
};
export const displayAssessmentPoints = (units: number) => (units / 100).toFixed(2).replace(/\.00$/, '');
function localTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function assessmentDraftForm(draft: StoredAssessmentDraft | null): AssessmentDraftForm {
  return {
    title: draft?.title ?? '', instructions: draft?.instructions ?? '', availableAt: localTime(draft?.availableAt ?? null),
    dueAt: localTime(draft?.dueAt ?? null), closesAt: localTime(draft?.closesAt ?? null),
    questions: draft?.questions.map(question => ({ questionVersionId: question.questionVersionId, points: displayAssessmentPoints(question.maxUnits) })) ?? [],
  };
}
export function assessmentFormInput(classId: string, form: AssessmentDraftForm): AssessmentDraftInput {
  if (form.title.trim().length < 3 || form.title.trim().length > 160) throw new Error('Enter a quiz title of 3–160 characters.');
  if (form.instructions.length > 2_000) throw new Error('Keep instructions within 2,000 characters.');
  if (form.questions.length < 1 || form.questions.length > 30) throw new Error('Add one to thirty questions.');
  const seen = new Set<string>();
  let total = 0;
  const questions = form.questions.map(question => {
    if (seen.has(question.questionVersionId)) throw new Error('Each question can appear only once.');
    seen.add(question.questionVersionId);
    const maxUnits = parseGradePoints(question.points);
    if (maxUnits < 1 || maxUnits > 1_000_000) throw new Error('Each question needs at least 0.01 points.');
    total += maxUnits;
    return { questionVersionId: question.questionVersionId, maxUnits };
  });
  if (total > 1_000_000) throw new Error('Keep the quiz at or below 10,000 points.');
  const time = (value: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf()) || localTime(date.toISOString()) !== value) throw new Error('Choose a valid local date and time.');
    return date.toISOString();
  };
  const availableAt = time(form.availableAt), dueAt = time(form.dueAt), closesAt = time(form.closesAt);
  const dates = [availableAt, dueAt, closesAt].filter((value): value is string => value !== null);
  if (dates.some((value, index) => index > 0 && value < dates[index - 1])) throw new Error('Opening, due, and closing times must be in that order.');
  return { classId, title: form.title.trim(), instructions: form.instructions.trim(), questions, availableAt, dueAt, closesAt };
}

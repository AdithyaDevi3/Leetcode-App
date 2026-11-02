import { parseGradePoints } from '@leetcode-app/domain';
import type { TemplateContent, TemplateView } from '@/lib/assessment-template-api-types';
import { displayAssessmentPoints } from '@/lib/assessment-draft-form';
import { record } from './template-contract';

export type TemplateForm = { title: string; instructions: string; questions: { questionVersionId: string; points: string }[] };
export function templateForm(template: TemplateView): TemplateForm {
  return { title: template.title, instructions: template.instructions, questions: template.questions.map(item => ({ questionVersionId: item.questionVersionId, points: displayAssessmentPoints(item.maxUnits) })) };
}
export function validForm(value: unknown): value is TemplateForm {
  return record(value) && Object.keys(value).length === 3 && typeof value.title === 'string' && value.title.length <= 160
    && typeof value.instructions === 'string' && value.instructions.length <= 2_000 && Array.isArray(value.questions) && value.questions.length <= 30
    && value.questions.every(item => record(item) && Object.keys(item).length === 2 && typeof item.questionVersionId === 'string'
      && /^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/.test(item.questionVersionId) && typeof item.points === 'string' && item.points.length <= 32);
}
export function templateContent(form: TemplateForm): TemplateContent {
  if (form.title.trim().length < 3 || form.title.trim().length > 160) throw new Error('Enter a template title of 3–160 characters.');
  if (form.instructions.length > 2_000) throw new Error('Keep instructions within 2,000 characters.');
  if (form.questions.length < 1 || form.questions.length > 30) throw new Error('Choose one to thirty reviewed questions.');
  const selected = new Set<string>(); let total = 0;
  const questions = form.questions.map(item => {
    const logicalId = item.questionVersionId.split('@')[0];
    if (selected.has(logicalId)) throw new Error('Each logical question can appear only once, including across versions.');
    selected.add(logicalId);
    const maxUnits = parseGradePoints(item.points);
    if (maxUnits < 1 || maxUnits > 1_000_000) throw new Error('Each question needs 0.01–10,000 points.');
    total += maxUnits; return { questionVersionId: item.questionVersionId, maxUnits };
  });
  if (total > 1_000_000) throw new Error('Keep the total at or below 10,000 points.');
  return { title: form.title.trim(), instructions: form.instructions.trim(), questions };
}
export function formSignature(form: TemplateForm): string {
  try { return JSON.stringify(templateContent(form)); } catch { return `invalid:${JSON.stringify(form)}`; }
}

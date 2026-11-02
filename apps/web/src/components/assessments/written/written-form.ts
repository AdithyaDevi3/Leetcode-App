import type { WrittenAssessmentDraft, WrittenAssessmentDraftInput } from '@leetcode-app/database';
import { integer, record, validCriteria } from './written-contract';
import { displayAssessmentPoints as points } from '@/lib/assessment-draft-form';

export type WrittenForm = { title: string; instructions: string; prompt: string; criteria: { id: string; label: string; points: string }[]; availableAt: string; dueAt: string; closesAt: string };
export const signature = (form: WrittenForm) => JSON.stringify(form);
const localDate = (value: string | null) => value ? value.replace(/Z$/, '') : '';
export function writtenForm(draft?: WrittenAssessmentDraft): WrittenForm {
  return draft ? { title: draft.title, instructions: draft.instructions, prompt: draft.prompt,
    criteria: draft.criteria.map(item => ({ id: item.id, label: item.label, points: points(item.maxUnits) })),
    availableAt: localDate(draft.availableAt), dueAt: localDate(draft.dueAt), closesAt: localDate(draft.closesAt) }
    : { title: '', instructions: '', prompt: '', criteria: [{ id: 'reasoning', label: 'Reasoning and approach', points: '10' }], availableAt: '', dueAt: '', closesAt: '' };
}
export function validForm(value: unknown): value is WrittenForm {
  return record(value) && Object.keys(value).length === 7 && ['title', 'instructions', 'prompt', 'availableAt', 'dueAt', 'closesAt'].every(key => typeof value[key] === 'string' && value[key].length <= (key === 'prompt' ? 20_000 : key === 'instructions' ? 2000 : 160))
    && Array.isArray(value.criteria) && value.criteria.length >= 1 && value.criteria.length <= 20 && value.criteria.every(item => record(item)
      && Object.keys(item).length === 3 && typeof item.id === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(item.id) && !['__proto__', 'constructor', 'prototype'].includes(item.id)
      && typeof item.label === 'string' && item.label.length <= 160 && typeof item.points === 'string' && item.points.length <= 20)
    && new Set(value.criteria.map(item => item.id)).size === value.criteria.length;
}
function timestamp(value: string): string | null {
  if (!value) return null;
  const matched = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!matched) throw new Error('Choose valid UTC dates.');
  const canonical = `${matched[1]}:${matched[2] ?? '00'}.${(matched[3] ?? '').padEnd(3, '0')}Z`;
  const result = new Date(canonical);
  if (!Number.isFinite(result.valueOf()) || result.toISOString() !== canonical) throw new Error('Choose valid UTC dates.');
  return result.toISOString();
}
export function formInput(classId: string, form: WrittenForm): WrittenAssessmentDraftInput {
  if (form.title.trim().length < 3 || form.title.trim().length > 160 || !form.prompt.trim() || form.prompt.length > 20_000 || form.instructions.length > 2000) throw new Error('Add a title, an assignment prompt and valid instructions.');
  const criteria = form.criteria.map(item => {
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(item.points)) throw new Error('Use positive criterion points with at most two decimal places.');
    const [whole, fraction = ''] = item.points.split('.');
    const maxUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!integer(maxUnits, 1)) throw new Error('Use positive criterion points with at most two decimal places.');
    return { id: item.id, label: item.label.trim(), maxUnits };
  });
  if (!validCriteria(criteria)) throw new Error('Add one to twenty distinct named criteria, up to 10,000 points total.');
  const availableAt = timestamp(form.availableAt), dueAt = timestamp(form.dueAt), closesAt = timestamp(form.closesAt);
  const dates = [availableAt, dueAt, closesAt].filter((value): value is string => value !== null);
  if (dates.some((value, index) => index > 0 && value < dates[index - 1])) throw new Error('Opening, due and closing dates must be in order.');
  return { classId, title: form.title.trim(), instructions: form.instructions, prompt: form.prompt, criteria, availableAt, dueAt, closesAt };
}

import { findPracticeItem } from './content';
import { toPersistedContentId } from './content-id';

type Parsed<T> = { success: true; data: T } | { success: false; message: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/;

export function normalizeClassCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  return codePattern.test(code) ? code : null;
}

export function parseClassCreation(formData: FormData): Parsed<{
  name: string; description: string; reason: string;
}> {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (name.length < 3 || name.length > 120) {
    return { success: false, message: 'Class name must be 3–120 characters.' };
  }
  if (description.length > 1_000) {
    return { success: false, message: 'Description must be at most 1,000 characters.' };
  }
  if (reason.length < 8 || reason.length > 500) {
    return { success: false, message: 'Give an access-management reason of 8–500 characters.' };
  }
  return { success: true, data: { name, description, reason } };
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseClassAssignment(formData: FormData): Parsed<{
  classId: string; contentId: string; title: string; instructions: string;
  dueOn: string | null; reason: string;
}> {
  const classId = String(formData.get('classId') ?? '').trim();
  const activitySlug = String(formData.get('activitySlug') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const instructions = String(formData.get('instructions') ?? '').trim();
  const dueOn = String(formData.get('dueOn') ?? '').trim() || null;
  const reason = String(formData.get('reason') ?? '').trim();
  if (!uuidPattern.test(classId)) return { success: false, message: 'Choose a valid class.' };
  if (!findPracticeItem(activitySlug)) return { success: false, message: 'Choose a practice activity.' };
  if (title.length < 3 || title.length > 160) {
    return { success: false, message: 'Task title must be 3–160 characters.' };
  }
  if (instructions.length > 2_000) {
    return { success: false, message: 'Instructions must be at most 2,000 characters.' };
  }
  if (dueOn && !validDate(dueOn)) return { success: false, message: 'Choose a valid due date.' };
  if (reason.length < 8 || reason.length > 500) {
    return { success: false, message: 'Give an assignment reason of 8–500 characters.' };
  }
  return {
    success: true,
    data: { classId, contentId: toPersistedContentId(activitySlug), title, instructions, dueOn, reason },
  };
}

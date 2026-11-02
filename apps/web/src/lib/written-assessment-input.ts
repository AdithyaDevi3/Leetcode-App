import type { WrittenDraftCommand, WrittenPublishCommand, WrittenSaveCommand, WrittenSubmitCommand, WrittenWorkspace } from './written-assessment-api-types';
import { assessmentUuid } from './assessment-draft-input';

export class WrittenAssessmentInputError extends Error {}
const invalid = (): never => { throw new WrittenAssessmentInputError('Use valid assignment content, saved revisions and enrolled learners.'); };
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
export function writtenId(value: unknown): string {
  if (typeof value !== 'string' || !assessmentUuid.test(value)) return invalid();
  return value.toLowerCase();
}
function integer(value: unknown, minimum = 1, maximum = 2_147_483_647): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) return invalid();
  return value as number;
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string' || !writtenTextUnicode(value) || value.length > maximum || value.trim().length < minimum) return invalid();
  return value.trim();
}
function writtenTextUnicode(value: string): boolean {
  if (value.includes('\0')) return false;
  for (const character of value) {
    if (character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff) return false;
  }
  return true;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.startsWith('0000-') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || ![date.toISOString(), date.toISOString().replace('.000Z', 'Z')].includes(value)) return invalid();
  return date.toISOString();
}
export function writtenQuery(request: Request, author: boolean, classRequired = false): { workspace: WrittenWorkspace; classId: string | null } {
  const params = new URL(request.url).searchParams;
  const fields = author ? classRequired ? ['workspace', 'classId'] : ['workspace'] : [];
  if ([...params.keys()].some(key => !fields.includes(key) || params.getAll(key).length !== 1)) return invalid();
  if (!author) return { workspace: 'teach', classId: null };
  const workspace = params.get('workspace');
  if (workspace !== 'teach' && workspace !== 'admin') return invalid();
  return { workspace, classId: classRequired ? writtenId(params.get('classId')) : null };
}
export function writtenDraftCommand(value: unknown): WrittenDraftCommand {
  const body = record(value, ['draftId', 'expectedRevision', 'requestKey', 'draft']);
  const draftId = body.draftId === null ? null : writtenId(body.draftId);
  const expectedRevision = draftId === null ? body.expectedRevision === null ? null : invalid() : integer(body.expectedRevision);
  const input = record(body.draft, ['classId', 'title', 'instructions', 'prompt', 'criteria', 'availableAt', 'dueAt', 'closesAt']);
  if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 20) return invalid();
  let total = 0;
  const seen = new Set<string>();
  const criteria = input.criteria.map(value => {
    const criterion = record(value, ['id', 'label', 'maxUnits']);
    if (typeof criterion.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(criterion.id)
      || ['constructor', 'prototype', '__proto__'].includes(criterion.id) || seen.has(criterion.id)) return invalid();
    seen.add(criterion.id);
    const maxUnits = integer(criterion.maxUnits, 1, 1_000_000); total += maxUnits;
    if (total > 1_000_000) return invalid();
    return { id: criterion.id, label: text(criterion.label, 1, 160), maxUnits };
  });
  const availableAt = timestamp(input.availableAt), dueAt = timestamp(input.dueAt), closesAt = timestamp(input.closesAt);
  const dates = [availableAt, dueAt, closesAt].filter((date): date is string => date !== null);
  if (dates.some((date, index) => index > 0 && date < dates[index - 1])) return invalid();
  return { draftId, expectedRevision, requestKey: text(body.requestKey, 1, 128), draft: {
    classId: writtenId(input.classId), title: text(input.title, 3, 160), instructions: text(input.instructions, 0, 2_000),
    prompt: text(input.prompt, 1, 20_000), criteria, availableAt, dueAt, closesAt,
  } };
}
export function writtenPublishCommand(value: unknown): WrittenPublishCommand {
  const body = record(value, ['expectedRevision', 'expectedRosterFingerprint', 'audience', 'requestKey']);
  const audience = record(body.audience, ['kind', 'learnerIds']);
  if ((audience.kind !== 'class' && audience.kind !== 'selected') || !Array.isArray(audience.learnerIds)
    || audience.learnerIds.length < 1 || audience.learnerIds.length > 2_000) return invalid();
  const learnerIds = audience.learnerIds.map(writtenId);
  if (new Set(learnerIds).size !== learnerIds.length || typeof body.expectedRosterFingerprint !== 'string'
    || !/^[a-f0-9]{64}$/.test(body.expectedRosterFingerprint)) return invalid();
  return { expectedRevision: integer(body.expectedRevision), expectedRosterFingerprint: body.expectedRosterFingerprint,
    audience: { kind: audience.kind as 'class' | 'selected', learnerIds }, requestKey: text(body.requestKey, 1, 128) };
}
export function writtenSaveCommand(value: unknown): WrittenSaveCommand {
  const body = record(value, ['expectedRevision', 'text', 'requestKey']);
  if (typeof body.text !== 'string' || !writtenTextUnicode(body.text) || new TextEncoder().encode(body.text).byteLength > 100_000) return invalid();
  return { expectedRevision: integer(body.expectedRevision, 0), text: body.text, requestKey: text(body.requestKey, 1, 128) };
}
export function writtenSubmitCommand(value: unknown): WrittenSubmitCommand {
  const body = record(value, ['expectedRevision', 'requestKey']);
  return { expectedRevision: integer(body.expectedRevision), requestKey: text(body.requestKey, 1, 128) };
}

import type { AnnouncementListOptions, ClassPortalWorkspace } from '@leetcode-app/database';

export const classPortalCommandBytes = 90_000;
export class ClassPortalInputError extends Error {
  constructor() { super('Use a valid class announcement request.'); this.name = 'ClassPortalInputError'; }
}
const invalid = (): never => { throw new ClassPortalInputError(); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function classPortalId(value: unknown): string {
  return typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : invalid();
}
export function classPortalWorkspace(value: unknown): ClassPortalWorkspace {
  return value === 'learner' || value === 'teach' || value === 'admin' ? value : invalid();
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !fields.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function sequence(value: unknown, minimum = 0): number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) < 2_147_483_647 ? value as number : invalid();
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\u0000')
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return invalid();
  return value;
}
function instant(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) return invalid();
  return value;
}
export function classPortalQuery(request: Request, list = false): { workspace: ClassPortalWorkspace; options: AnnouncementListOptions } {
  const query = new URL(request.url).searchParams;
  const allowed = list ? ['workspace', 'limit', 'beforeAt', 'beforeId', 'state'] : ['workspace'];
  if ([...query.keys()].some(key => !allowed.includes(key) || query.getAll(key).length !== 1)
    || query.getAll('workspace').length !== 1) return invalid();
  const workspace = classPortalWorkspace(query.get('workspace'));
  if (!list) return { workspace, options: {} };
  const limit = query.get('limit'), state = query.get('state') ?? 'current';
  if (limit !== null && (!/^[1-9]\d?$/.test(limit) || Number(limit) > 50)
    || !['current', 'archived', 'all'].includes(state) || workspace === 'learner' && state !== 'current') return invalid();
  const hasAt = query.has('beforeAt'), hasId = query.has('beforeId');
  if (hasAt !== hasId) return invalid();
  return { workspace, options: { limit: limit === null ? 25 : Number(limit), state: state as 'current' | 'archived' | 'all',
    ...(hasAt ? { cursor: { at: instant(query.get('beforeAt')), id: classPortalId(query.get('beforeId')) } } : {}) } };
}
export function classPortalSaveCommand(value: unknown) {
  const body = record(value, ['expectedSequence', 'title', 'body', 'requestKey']);
  const title = text(body.title, 160).trim(), content = text(body.body, 20_000);
  if (new TextEncoder().encode(content).byteLength > 80_000) return invalid();
  return { expectedSequence: sequence(body.expectedSequence), title, body: content, requestKey: classPortalId(body.requestKey) };
}
export function classPortalPublishCommand(value: unknown) {
  const body = record(value, ['expectedSequence', 'revisionId', 'requestKey']);
  return { expectedSequence: sequence(body.expectedSequence), revisionId: classPortalId(body.revisionId), requestKey: classPortalId(body.requestKey) };
}
export function classPortalArchiveCommand(value: unknown) {
  const body = record(value, ['expectedSequence', 'requestKey']);
  return { expectedSequence: sequence(body.expectedSequence), requestKey: classPortalId(body.requestKey) };
}
export function classPortalReadCommand(value: unknown) {
  const body = record(value, ['publicationSequence', 'requestKey']);
  return { publicationSequence: sequence(body.publicationSequence, 1), requestKey: classPortalId(body.requestKey) };
}

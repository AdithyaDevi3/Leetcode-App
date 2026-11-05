import type { AnnouncementList, AnnouncementReceipt, AnnouncementView, ClassPortalWorkspace } from '@leetcode-app/database';

type Command = { requestKey: string; expectedSequence: number };
export type PendingAnnouncementAction = { announcementId: string } & (
  | { kind: 'save'; body: Command & { title: string; body: string } }
  | { kind: 'publish'; body: Command & { revisionId: string } }
  | { kind: 'archive'; body: Command }
  | { kind: 'read'; revisionId: string; body: { requestKey: string; publicationSequence: number } }
);

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
export const portalUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const number = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) < 2_147_483_647;
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const text = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum
  && !/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
export const announcementTextValid = (title: string, body: string) => text(title, 160) && Boolean(title.trim()) && title === title.trim()
  && text(body, 20_000) && Boolean(body.trim()) && new TextEncoder().encode(body).byteLength <= 80_000;

export function isPendingAnnouncementAction(value: unknown): value is PendingAnnouncementAction {
  if (!record(value) || !portalUuid(value.announcementId) || !record(value.body) || !portalUuid(value.body.requestKey)) return false;
  const body = value.body;
  if (value.kind === 'read') return exact(value, ['announcementId', 'kind', 'body', 'revisionId']) && portalUuid(value.revisionId)
    && exact(body, ['requestKey', 'publicationSequence']) && number(body.publicationSequence, 1);
  if (!exact(value, ['announcementId', 'kind', 'body']) || !number(body.expectedSequence)) return false;
  if (value.kind === 'save') return exact(body, ['requestKey', 'expectedSequence', 'title', 'body'])
    && typeof body.title === 'string' && typeof body.body === 'string' && announcementTextValid(body.title, body.body);
  if (value.kind === 'publish') return exact(body, ['requestKey', 'expectedSequence', 'revisionId']) && portalUuid(body.revisionId);
  return value.kind === 'archive' && exact(body, ['requestKey', 'expectedSequence']);
}

export function announcementReceiptMatches(value: unknown, action: PendingAnnouncementAction, classId: string, actorId: string): value is AnnouncementReceipt {
  if (!record(value) || !portalUuid(value.id) || value.actorId !== actorId || value.classId !== classId
    || value.announcementId !== action.announcementId || value.action !== action.kind || !instant(value.createdAt)
    || !number(value.sequence, 1) || !(value.revisionId === null || portalUuid(value.revisionId))
    || !(value.publicationSequence === null || number(value.publicationSequence, 1))) return false;
  if (action.kind === 'read') return value.sequence === action.body.publicationSequence && value.publicationSequence === action.body.publicationSequence && value.revisionId === action.revisionId;
  if (value.sequence !== action.body.expectedSequence + 1) return false;
  if (action.kind === 'save') return portalUuid(value.revisionId) && value.publicationSequence === null;
  if (action.kind === 'publish') return value.revisionId === action.body.revisionId && value.publicationSequence === value.sequence;
  return value.revisionId === null && value.publicationSequence === null;
}

const context = (value: unknown, classId: string) => record(value) && value.id === classId && text(value.name, 500)
  && text(value.description, 5_000) && text(value.instructorName, 500) && number(value.learnerCount);
const content = (value: unknown) => record(value) && portalUuid(value.revisionId) && number(value.revisionNumber, 1)
  && typeof value.title === 'string' && typeof value.body === 'string' && announcementTextValid(value.title, value.body)
  && instant(value.createdAt) && text(value.authorName, 500);

export function isAnnouncementList(value: unknown, classId: string, workspace: ClassPortalWorkspace): value is AnnouncementList {
  if (!record(value) || !context(value.classroom, classId) || !Array.isArray(value.items) || value.items.length > 50
    || !(value.nextCursor === null || record(value.nextCursor) && instant(value.nextCursor.at) && portalUuid(value.nextCursor.id))) return false;
  const ids = new Set();
  return value.items.every(item => {
    if (!record(item) || !portalUuid(item.id) || ids.has(item.id) || !text(item.title, 160) || !text(item.excerpt, 500)
      || typeof item.unread !== 'boolean' || !(item.publishedAt === null || instant(item.publishedAt))
      || !(item.publicationSequence === null || number(item.publicationSequence, 1))) return false;
    ids.add(item.id);
    if (workspace === 'learner') return !Object.hasOwn(item, 'authorState') && instant(item.publishedAt) && number(item.publicationSequence, 1);
    return record(item.authorState) && number(item.authorState.sequence, 1) && number(item.authorState.revisionNumber, 1)
      && ['draft', 'published', 'archived'].includes(String(item.authorState.status)) && typeof item.authorState.hasUnpublishedChanges === 'boolean';
  });
}

export function isAnnouncementView(value: unknown, classId: string, announcementId: string, workspace: ClassPortalWorkspace): value is AnnouncementView {
  if (!record(value) || !context(value.classroom, classId) || !record(value.announcement)) return false;
  const item = value.announcement;
  if (item.id !== announcementId || !number(item.sequence, 1) || typeof item.unread !== 'boolean'
    || !['draft', 'published', 'archived'].includes(String(item.status)) || !(item.draft === null || content(item.draft))) return false;
  const published = item.published;
  if (!(published === null || record(published) && portalUuid(published.id) && number(published.sequence, 1) && instant(published.publishedAt) && content(published.content))) return false;
  return workspace !== 'learner' || item.draft === null && item.status === 'published' && record(published) && item.sequence === published.sequence;
}

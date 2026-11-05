import 'server-only';

import { NextResponse } from 'next/server';
import {
  ClassPortalAccessError, ClassPortalConflictError, ClassPortalValidationError,
  type AnnouncementContent, type AnnouncementList, type AnnouncementReceipt, type AnnouncementSummary,
  type AnnouncementView, type ClassPortalContext, type ClassPortalWorkspace,
} from '@leetcode-app/database';
import { readClassPortalData, type ClassPortalAccess, type ClassPortalActor } from './class-portal-access';
import {
  ClassPortalInputError, classPortalCommandBytes, classPortalId, classPortalQuery,
  classPortalSaveCommand, classPortalPublishCommand, classPortalArchiveCommand, classPortalReadCommand,
} from './class-portal-input';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-assessment-author' };
class ClassPortalApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function ensure(value: unknown): asserts value { if (!value) throw new Error('Class portal response validation failed'); }
function id(value: string): string {
  try { ensure(classPortalId(value) === value); return value; }
  catch { throw new Error('Class portal response identity changed'); }
}
function integer(value: number, minimum = 0): number {
  ensure(Number.isSafeInteger(value) && value >= minimum && value <= 2_147_483_647); return value;
}
function text(value: string, maximum: number, nonempty = false): string {
  ensure(typeof value === 'string' && value.length <= maximum && (!nonempty || Boolean(value.trim())) && !value.includes('\u0000')
    && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)); return value;
}
function instant(value: string): string {
  ensure(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value); return value;
}
function classroom(source: ClassPortalContext, classId: string): ClassPortalContext {
  ensure(source.id === classId);
  return { id: id(source.id), name: text(source.name, 120, true), description: text(source.description, 2_000),
    instructorName: text(source.instructorName, 500, true), learnerCount: integer(source.learnerCount) };
}
function content(source: AnnouncementContent): AnnouncementContent {
  const body = text(source.body, 20_000, true); ensure(new TextEncoder().encode(body).byteLength <= 80_000);
  return { revisionId: id(source.revisionId), revisionNumber: integer(source.revisionNumber, 1), title: text(source.title, 160, true),
    body, createdAt: instant(source.createdAt), authorName: text(source.authorName, 500, true) };
}
const statuses = new Set(['draft', 'published', 'archived']);
function summary(source: AnnouncementSummary, workspace: ClassPortalWorkspace): AnnouncementSummary {
  ensure(typeof source.unread === 'boolean');
  const publishedAt = source.publishedAt === null ? null : instant(source.publishedAt);
  const publicationSequence = source.publicationSequence === null ? null : integer(source.publicationSequence, 1);
  ensure((publishedAt === null) === (publicationSequence === null));
  if (workspace === 'learner') ensure(publishedAt !== null && publicationSequence !== null);
  const result: AnnouncementSummary = { id: id(source.id), title: text(source.title, 160, true), excerpt: text(source.excerpt, 500),
    publishedAt, publicationSequence, unread: source.unread };
  if (workspace !== 'learner') {
    const author = source.authorState;
    ensure(author && statuses.has(author.status) && typeof author.hasUnpublishedChanges === 'boolean');
    const sequence = integer(author.sequence, 1), revisionNumber = integer(author.revisionNumber, 1);
    if (publicationSequence !== null) ensure(publicationSequence <= sequence);
    result.authorState = { sequence, revisionNumber, status: author.status, hasUnpublishedChanges: author.hasUnpublishedChanges };
  }
  return result;
}
function announcementList(source: AnnouncementList, classId: string, workspace: ClassPortalWorkspace, limit: number): AnnouncementList {
  ensure(Array.isArray(source.items) && source.items.length <= limit);
  const items = source.items.map(item => summary(item, workspace));
  ensure(new Set(items.map(item => item.id)).size === items.length);
  const nextCursor = source.nextCursor === null ? null : { at: instant(source.nextCursor.at), id: id(source.nextCursor.id) };
  if (nextCursor) ensure(items.length === limit && nextCursor.id === items.at(-1)?.id);
  return { classroom: classroom(source.classroom, classId), items, nextCursor };
}
function announcementView(source: AnnouncementView, classId: string, announcementId: string, workspace: ClassPortalWorkspace): AnnouncementView {
  const item = source.announcement;
  ensure(item.id === announcementId && statuses.has(item.status) && typeof item.unread === 'boolean');
  const published = item.published === null ? null : { id: id(item.published.id), sequence: integer(item.published.sequence, 1),
    content: content(item.published.content), publishedAt: instant(item.published.publishedAt) };
  if (workspace === 'learner') {
    ensure(item.status === 'published' && published && item.sequence === published.sequence);
    return { classroom: classroom(source.classroom, classId), announcement: { id: id(item.id), sequence: published.sequence,
      status: 'published', draft: null, published, unread: item.unread } };
  }
  const sequence = integer(item.sequence, 1), draft = item.draft === null ? null : content(item.draft);
  ensure(draft && (!published || published.sequence <= sequence) && (item.status === 'published') === (published !== null));
  return { classroom: classroom(source.classroom, classId), announcement: { id: id(item.id), sequence,
    status: item.status, draft, published, unread: item.unread } };
}
function actor(request: Request, user: ClassPortalActor, required = false): void {
  const expected = request.headers.get('x-assessment-author');
  if ((required || expected !== null) && expected !== user.id) throw new ClassPortalApiError(409, 'owner_changed', 'Your account changed. Reopen this class in the intended account.');
}
function authorized<T>(access: ClassPortalAccess<T>): T {
  if (access.status === 'unauthenticated') throw new ClassPortalApiError(401, 'authentication_required', 'Sign in to open your class.');
  if (access.status === 'forbidden') throw new ClassPortalApiError(403, 'forbidden', 'Permission to use this class workspace is required.');
  return access.data;
}
function requireMode(workspace: ClassPortalWorkspace, learner: boolean): void {
  if ((workspace === 'learner') !== learner) throw new ClassPortalApiError(403, 'forbidden', 'Use the class workspace for your current role.');
}
async function body(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new ClassPortalInputError();
  return decodeQuizRequest(request, classPortalCommandBytes);
}
function receipt(source: AnnouncementReceipt, expected: {
  actorId: string; classId: string; announcementId: string; action: AnnouncementReceipt['action']; sequence: number; revisionId?: string;
}): AnnouncementReceipt {
  ensure(source.actorId === expected.actorId && source.classId === expected.classId && source.announcementId === expected.announcementId
    && source.action === expected.action && source.sequence === expected.sequence);
  const revisionId = source.revisionId === null ? null : id(source.revisionId);
  const publicationSequence = source.publicationSequence === null ? null : integer(source.publicationSequence, 1);
  if (expected.action === 'save') ensure(revisionId && publicationSequence === null);
  else if (expected.action === 'publish') ensure(revisionId === expected.revisionId && publicationSequence === source.sequence);
  else if (expected.action === 'archive') ensure(revisionId === null && publicationSequence === null);
  else ensure(revisionId && publicationSequence === source.sequence);
  return { id: id(source.id), actorId: id(source.actorId), classId: id(source.classId), announcementId: id(source.announcementId), action: source.action,
    sequence: integer(source.sequence, 1), revisionId, publicationSequence, createdAt: instant(source.createdAt) };
}

export async function readClassPortal(request: Request, rawClassId: string) {
  const { workspace } = classPortalQuery(request);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user); const classId = classPortalId(rawClassId);
    return { actorId: user.id, classroom: classroom(await repository.readClass(classId), classId) };
  }));
}
export async function readClassAnnouncements(request: Request, rawClassId: string) {
  const { workspace, options } = classPortalQuery(request, true);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user); const classId = classPortalId(rawClassId);
    return { actorId: user.id, list: announcementList(await repository.listAnnouncements(classId, options), classId, workspace, options.limit ?? 25) };
  }));
}
export async function readClassAnnouncement(request: Request, rawClassId: string, rawAnnouncementId: string) {
  const { workspace } = classPortalQuery(request);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user); const classId = classPortalId(rawClassId), announcementId = classPortalId(rawAnnouncementId);
    return { actorId: user.id, view: announcementView(await repository.readAnnouncement(classId, announcementId), classId, announcementId, workspace) };
  }));
}
export async function saveClassAnnouncement(request: Request, rawClassId: string, rawAnnouncementId: string) {
  const { workspace } = classPortalQuery(request);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user, true); requireMode(workspace, false);
    const classId = classPortalId(rawClassId), announcementId = classPortalId(rawAnnouncementId), command = classPortalSaveCommand(await body(request));
    return { actorId: user.id, receipt: receipt(await repository.saveAnnouncement({ classId, announcementId, ...command }),
      { actorId: user.id, classId, announcementId, action: 'save', sequence: command.expectedSequence + 1 }) };
  }));
}
export async function publishClassAnnouncement(request: Request, rawClassId: string, rawAnnouncementId: string) {
  const { workspace } = classPortalQuery(request);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user, true); requireMode(workspace, false);
    const classId = classPortalId(rawClassId), announcementId = classPortalId(rawAnnouncementId), command = classPortalPublishCommand(await body(request));
    return { actorId: user.id, receipt: receipt(await repository.publishAnnouncement({ classId, announcementId, ...command }),
      { actorId: user.id, classId, announcementId, action: 'publish', sequence: command.expectedSequence + 1, revisionId: command.revisionId }) };
  }));
}
export async function archiveClassAnnouncement(request: Request, rawClassId: string, rawAnnouncementId: string) {
  const { workspace } = classPortalQuery(request);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user, true); requireMode(workspace, false);
    const classId = classPortalId(rawClassId), announcementId = classPortalId(rawAnnouncementId), command = classPortalArchiveCommand(await body(request));
    return { actorId: user.id, receipt: receipt(await repository.archiveAnnouncement({ classId, announcementId, ...command }),
      { actorId: user.id, classId, announcementId, action: 'archive', sequence: command.expectedSequence + 1 }) };
  }));
}
export async function markClassAnnouncementRead(request: Request, rawClassId: string, rawAnnouncementId: string) {
  const { workspace } = classPortalQuery(request);
  return authorized(await readClassPortalData(workspace, async (repository, user) => {
    actor(request, user, true); requireMode(workspace, true);
    const classId = classPortalId(rawClassId), announcementId = classPortalId(rawAnnouncementId), command = classPortalReadCommand(await body(request));
    return { actorId: user.id, receipt: receipt(await repository.markRead({ classId, announcementId, ...command }),
      { actorId: user.id, classId, announcementId, action: 'read', sequence: command.publicationSequence }) };
  }));
}
export function classPortalJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers }); }
export function classPortalFailure(error: unknown) {
  let status = 503, code = 'temporarily_unavailable', message = 'Class updates are temporarily unavailable. Keep your original request and retry.';
  if (error instanceof ClassPortalApiError) { status = error.status; code = error.code; message = error.message; }
  else if (error instanceof ClassPortalInputError || error instanceof QuizInputError || error instanceof ClassPortalValidationError) {
    status = error instanceof QuizInputError ? error.status : 400; code = 'invalid_request'; message = 'Use a valid class, saved announcement and current publication.';
  } else if (error instanceof ClassPortalAccessError) { status = 404; code = 'unavailable'; message = 'This class update is not available.'; }
  else if (error instanceof ClassPortalConflictError) { status = 409; code = 'conflict'; message = 'This announcement changed. Review the latest saved version before making a new request.'; }
  return classPortalJson({ error: code, code, message }, status);
}

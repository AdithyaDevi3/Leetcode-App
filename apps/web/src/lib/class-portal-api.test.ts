import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn(), roles: vi.fn(), principal: vi.fn(),
  classroom: vi.fn(), list: vi.fn(), detail: vi.fn(), save: vi.fn(), publish: vi.fn(), archive: vi.fn(), read: vi.fn(),
  AccessError: class ClassPortalAccessError extends Error {}, ConflictError: class ClassPortalConflictError extends Error {},
  ValidationError: class ClassPortalValidationError extends Error {},
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  ClassPortalAccessError: mocks.AccessError, ClassPortalConflictError: mocks.ConflictError, ClassPortalValidationError: mocks.ValidationError,
  PostgresAdministrationRepository: class { listActiveRoles = mocks.roles; },
  PostgresClassPortalRepository: class {
    constructor(db: unknown, principal: unknown) { mocks.principal(db, principal); }
    readClass = mocks.classroom; listAnnouncements = mocks.list; readAnnouncement = mocks.detail;
    saveAnnouncement = mocks.save; publishAnnouncement = mocks.publish; archiveAnnouncement = mocks.archive; markRead = mocks.read;
  },
}));

import { GET as classGet } from '@/app/api/class-portal/[classId]/route';
import { GET as listGet } from '@/app/api/class-portal/[classId]/announcements/route';
import { GET as detailGet } from '@/app/api/class-portal/[classId]/announcements/[announcementId]/route';
import { POST as savePost } from '@/app/api/class-portal/[classId]/announcements/[announcementId]/draft/route';
import { POST as publishPost } from '@/app/api/class-portal/[classId]/announcements/[announcementId]/publications/route';
import { POST as archivePost } from '@/app/api/class-portal/[classId]/announcements/[announcementId]/archive/route';
import { POST as readPost } from '@/app/api/class-portal/[classId]/announcements/[announcementId]/read/route';
import { readClassPortalData } from './class-portal-access';

const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-abcd-4222-8222-222222222222';
const announcementId = '33333333-abcd-4333-8333-333333333333';
const revisionId = '44444444-abcd-4444-8444-444444444444';
const otherId = '55555555-abcd-4555-8555-555555555555';
const draftRevisionId = '66666666-abcd-4666-8666-666666666666';
const publicationId = '77777777-abcd-4777-8777-777777777777';
const receiptId = '88888888-abcd-4888-8888-888888888888';
const requestKey = '99999999-abcd-4999-8999-999999999999';
const date = '2026-11-04T16:00:00.000Z';
const classroom = () => ({ id: classId, name: 'Synthetic class', description: 'A synthetic classroom.', instructorName: 'Synthetic teacher', learnerCount: 2 });
const content = () => ({ revisionId, revisionNumber: 1, title: 'Published class update', body: 'Published synthetic instructions.', createdAt: date, authorName: 'Synthetic teacher' });
const published = () => ({ id: publicationId, sequence: 2, content: content(), publishedAt: date });
const summary = () => ({ id: announcementId, title: 'Saved draft update', excerpt: 'A synthetic draft excerpt.', publishedAt: date, publicationSequence: 2,
  unread: false, authorState: { sequence: 3, revisionNumber: 2, status: 'published' as const, hasUnpublishedChanges: true } });
const list = () => ({ classroom: classroom(), items: [summary()], nextCursor: null });
const view = () => ({ classroom: classroom(), announcement: { id: announcementId, sequence: 3, status: 'published' as const,
  draft: { ...content(), revisionId: draftRevisionId, revisionNumber: 2, title: 'Saved draft update', body: 'A later synthetic private draft.' }, published: published(), unread: false } });
const learnerView = () => ({ classroom: classroom(), announcement: { id: announcementId, sequence: 2, status: 'published' as const,
  draft: null, published: published(), unread: true } });
const saveCommand = () => ({ expectedSequence: 3, title: 'New saved update', body: '  Preserve the authored text.\n', requestKey });
const publishCommand = () => ({ expectedSequence: 3, revisionId: draftRevisionId, requestKey });
const archiveCommand = () => ({ expectedSequence: 3, requestKey });
const readCommand = () => ({ publicationSequence: 2, requestKey });
type Operation = 'classroom' | 'list' | 'detail' | 'save' | 'publish' | 'archive' | 'read';
const operations: Operation[] = ['classroom', 'list', 'detail', 'save', 'publish', 'archive', 'read'];
const mutations: Operation[] = ['save', 'publish', 'archive', 'read'];
const authorMutations: Operation[] = ['save', 'publish', 'archive'];
const defaultWorkspace = (operation: Operation) => operation === 'read' ? 'learner' : 'teach';
function prepare(operation: Operation) { if (operation === 'read') mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] }); }
function receipt(action: 'save' | 'publish' | 'archive' | 'read' = 'save') {
  return { id: receiptId, actorId, classId, announcementId, action, sequence: action === 'read' ? 2 : 4,
    revisionId: action === 'archive' ? null : action === 'read' ? revisionId : draftRevisionId,
    publicationSequence: action === 'publish' ? 4 : action === 'read' ? 2 : null, createdAt: date };
}
function command(operation: Operation) { return operation === 'save' ? saveCommand() : operation === 'publish' ? publishCommand() : operation === 'archive' ? archiveCommand() : readCommand(); }
function request(operation: Operation, options: { workspace?: string; owner?: string | null; body?: unknown; raw?: string; query?: string; headers?: Record<string, string> } = {}) {
  const mutation = mutations.includes(operation), suffix = operation === 'classroom' ? '' : operation === 'list' ? '/announcements'
    : `/announcements/${announcementId}${operation === 'save' ? '/draft' : operation === 'publish' ? '/publications' : operation === 'archive' ? '/archive' : operation === 'read' ? '/read' : ''}`;
  const query = options.query ?? `workspace=${options.workspace ?? defaultWorkspace(operation)}`;
  const headers: Record<string, string> = { ...(mutation ? { 'content-type': 'application/json' } : {}), ...options.headers };
  if (options.owner !== null) headers['x-assessment-author'] = options.owner ?? actorId;
  return new Request(`http://local/api/class-portal/${classId}${suffix}?${query}`, { method: mutation ? 'POST' : 'GET', headers,
    ...(mutation ? { body: options.raw ?? JSON.stringify(Object.hasOwn(options, 'body') ? options.body : command(operation)) } : {}) });
}
async function run(operation: Operation, req = request(operation), ids: { classId?: string; announcementId?: string } = {}) {
  const params = Promise.resolve({ classId: ids.classId ?? classId, announcementId: ids.announcementId ?? announcementId });
  const handler = operation === 'classroom' ? classGet : operation === 'list' ? listGet : operation === 'detail' ? detailGet
    : operation === 'save' ? savePost : operation === 'publish' ? publishPost : operation === 'archive' ? archivePost : readPost;
  return handler(req, { params });
}
function privateResponse(result: Response) {
  expect(result.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(result.headers.get('vary')).toBe('Cookie, x-assessment-author');
}
function noWrites() { for (const method of [mocks.save, mocks.publish, mocks.archive, mocks.read]) expect(method).not.toHaveBeenCalled(); }
function noLeak(value: string) { expect(value).not.toMatch(/PRIVATE_|postgres:\/\/|password|privateNote|joinCode|learnerEmail/); }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: actorId } });
  mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] }); mocks.roles.mockResolvedValue(['administrator']);
  mocks.classroom.mockResolvedValue(classroom()); mocks.list.mockResolvedValue(list()); mocks.detail.mockResolvedValue(view());
  mocks.save.mockResolvedValue(receipt('save')); mocks.publish.mockResolvedValue(receipt('publish'));
  mocks.archive.mockResolvedValue(receipt('archive')); mocks.read.mockResolvedValue(receipt('read'));
});

describe('class portal authentication, role and command boundaries', () => {
  it.each(operations)('denies anonymous %s before opening a database', async operation => {
    mocks.session.mockResolvedValue(null); const result = await run(operation);
    expect(result.status).toBe(401); privateResponse(result); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });
  it.each(operations)('fails closed on authentication outages for %s', async operation => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_AUTH_OUTAGE')); const result = await run(operation);
    expect(result.status).toBe(503); privateResponse(result); noLeak(await result.text()); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });
  it.each(mutations)('binds %s commands to the current actor before parsing the body', async operation => {
    prepare(operation);
    for (const owner of [null, otherId]) {
      const result = await run(operation, request(operation, { owner, raw: 'PRIVATE_MALFORMED_BODY' }));
      expect(result.status).toBe(409); privateResponse(result); expect(await result.json()).toMatchObject({ code: 'owner_changed' });
    }
    noWrites();
  });
  it.each(operations)('enforces an optional current-actor header on %s reads and writes', async operation => {
    prepare(operation); const result = await run(operation, request(operation, { owner: otherId }));
    expect(result.status).toBe(409); privateResponse(result); noWrites();
  });
  it.each(['classroom', 'list', 'detail'] as const)('permits an authorized %s read without an actor header', async operation => {
    const result = await run(operation, request(operation, { owner: null })); expect(result.status).toBe(200); privateResponse(result); noWrites();
  });
  it('constructs an explicit administrator principal from active roles, independent of user metadata', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run('classroom', request('classroom', { workspace: 'admin' }));
    expect(result.status).toBe(200); expect(mocks.roles).toHaveBeenCalledWith(actorId);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'administrator', userId: actorId });
  });
  it.each(operations.filter(operation => operation !== 'read'))('denies revoked admin permission for %s', async operation => {
    mocks.roles.mockResolvedValue([]); const result = await run(operation, request(operation, { workspace: 'admin' }));
    expect(result.status).toBe(403); privateResponse(result); expect(mocks.principal).not.toHaveBeenCalled(); noWrites();
  });
  it.each(authorMutations)('denies learners selecting teaching mode for %s', async operation => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] }); const result = await run(operation);
    expect(result.status).toBe(403); noWrites();
  });
  it.each(authorMutations)('denies a learner principal attempting %s', async operation => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run(operation, request(operation, { workspace: 'learner', raw: 'PRIVATE_BODY' }));
    expect(result.status).toBe(403); privateResponse(result); noWrites();
  });
  it('keeps read acknowledgements learner-only', async () => {
    const result = await run('read', request('read', { workspace: 'teach' }));
    expect(result.status).toBe(403); privateResponse(result); noWrites();
  });
  it.each(operations)('maps inaccessible or withdrawn %s records to a private 404', async operation => {
    prepare(operation); mocks[operation].mockRejectedValue(new mocks.AccessError('PRIVATE_RECORD'));
    const result = await run(operation); expect(result.status).toBe(404); privateResponse(result); noLeak(await result.text());
  });
  it.each(mutations)('sanitizes %s optimistic conflicts and validation errors', async operation => {
    prepare(operation);
    for (const [error, status] of [[new mocks.ConflictError('PRIVATE_CONFLICT'), 409], [new mocks.ValidationError('PRIVATE_VALIDATION'), 400]] as const) {
      mocks[operation].mockRejectedValue(error); const result = await run(operation);
      expect(result.status).toBe(status); privateResponse(result); noLeak(await result.text());
    }
  });
  it.each(['query', 'close', 'classroom', 'list', 'detail', 'save', 'publish', 'archive', 'read'] as const)('sanitizes a %s failure', async method => {
    const operation = method === 'query' || method === 'close' ? 'classroom' : method;
    prepare(operation); mocks[method].mockRejectedValue(new Error('PRIVATE_DATABASE postgres://password'));
    const result = await run(operation); expect(result.status).toBe(503); privateResponse(result); noLeak(await result.text());
  });
  it.each(mutations)('rejects malformed, duplicate-key and oversized %s JSON without writing', async operation => {
    prepare(operation);
    for (const raw of ['{', '{"requestKey":"first","requestKey":"second"}', '{"body":"a","body":"b"}']) {
      const result = await run(operation, request(operation, { raw })); expect(result.status).toBe(400); privateResponse(result);
    }
    const result = await run(operation, request(operation, { raw: ' '.repeat(90_001) }));
    expect(result.status).toBe(413); privateResponse(result); noWrites();
  });
  it('rejects oversized declared bodies and non-JSON content types', async () => {
    const large = await run('save', request('save', { headers: { 'content-length': '90001' } }));
    expect(large.status).toBe(413); privateResponse(large);
    const text = await run('save', request('save', { headers: { 'content-type': 'text/plain' } }));
    expect(text.status).toBe(400); privateResponse(text); noWrites();
  });
  it.each(operations)('rejects malformed class IDs for %s without reading a class record', async operation => {
    prepare(operation); const result = await run(operation, request(operation), { classId: 'bad' });
    expect(result.status).toBe(400); privateResponse(result); expect(mocks[operation]).not.toHaveBeenCalled();
  });
  it.each(['detail', 'save', 'publish', 'archive', 'read'] as const)('rejects malformed announcement IDs for %s', async operation => {
    prepare(operation); const result = await run(operation, request(operation), { announcementId: 'bad' });
    expect(result.status).toBe(400); noWrites();
  });
  it('canonicalizes path IDs while preserving the reviewed command', async () => {
    const result = await run('save', request('save'), { classId: classId.toUpperCase(), announcementId: announcementId.toUpperCase() });
    expect(result.status).toBe(201); expect(mocks.save).toHaveBeenCalledWith({ classId, announcementId, ...saveCommand() });
  });
});

describe('class announcement commands and safe projections', () => {
  it.each(mutations)('returns the original validated %s receipt on exact retry', async operation => {
    prepare(operation); const first = await run(operation), retry = await run(operation);
    expect(first.status).toBe(201); expect(retry.status).toBe(201); privateResponse(first);
    expect(await first.json()).toEqual(await retry.json());
    expect(mocks[operation].mock.calls[1]).toEqual(mocks[operation].mock.calls[0]);
    expect(mocks[operation]).toHaveBeenCalledWith({ classId, announcementId, ...command(operation) });
  });
  it('saves the exact authored body and a trimmed title without publishing it', async () => {
    const result = await run('save', request('save', { body: { ...saveCommand(), title: '  New saved update  ' } }));
    expect(result.status).toBe(201); expect(mocks.save).toHaveBeenCalledWith({ classId, announcementId, ...saveCommand() });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('passes bounded cursor/state options only to authorized author lists', async () => {
    const result = await run('list', request('list', { query: `workspace=admin&limit=1&state=archived&beforeAt=${date}&beforeId=${otherId}` }));
    expect(result.status).toBe(200); expect(mocks.list).toHaveBeenCalledWith(classId, { limit: 1, state: 'archived', cursor: { at: date, id: otherId } });
    const forbidden = await run('list', request('list', { query: 'workspace=learner&state=all' }));
    expect(forbidden.status).toBe(400); privateResponse(forbidden);
  });
  it('strips future private fields from class context and author projections', async () => {
    mocks.classroom.mockResolvedValue({ ...classroom(), joinCode: 'PRIVATE_CODE', learnerEmail: 'PRIVATE_EMAIL' });
    const result = await run('classroom'); expect(result.status).toBe(200); expect((await result.json()).classroom).toEqual(classroom());
    mocks.detail.mockResolvedValue({ ...view(), privateNote: 'PRIVATE_NOTE', announcement: { ...view().announcement, learnerEmail: 'PRIVATE_EMAIL',
      draft: { ...view().announcement.draft, privateNote: 'PRIVATE_CONTENT' } } });
    const detail = await run('detail'); expect(detail.status).toBe(200); noLeak(await detail.text());
  });
  it('returns only the pinned published content and sequence to a current learner', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    mocks.detail.mockResolvedValue({ ...learnerView(), announcement: { ...learnerView().announcement,
      draft: { revisionId: otherId, revisionNumber: 99, title: 'PRIVATE_DRAFT_TITLE', body: 'PRIVATE_DRAFT_BODY' },
      hasUnpublishedChanges: true, privateNote: 'PRIVATE_NOTE' } });
    const result = await run('detail', request('detail', { workspace: 'learner' }));
    expect(result.status).toBe(200); const body = await result.json();
    expect(body.view).toEqual(learnerView()); noLeak(JSON.stringify(body));
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'learner', userId: actorId });
  });
  it('strips private author state from learner lists and requires a published item', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    mocks.list.mockResolvedValue({ ...list(), items: [{ ...summary(), title: content().title, excerpt: content().body,
      authorState: { ...summary().authorState, title: 'PRIVATE_DRAFT_TITLE', body: 'PRIVATE_DRAFT_BODY' }, privateNote: 'PRIVATE_NOTE' }] });
    const result = await run('list', request('list', { workspace: 'learner' })); expect(result.status).toBe(200);
    const body = await result.json(); expect(body.list.items[0]).not.toHaveProperty('authorState'); noLeak(JSON.stringify(body));
    mocks.list.mockResolvedValue({ ...list(), items: [{ ...summary(), publishedAt: null, publicationSequence: null }] });
    const draft = await run('list', request('list', { workspace: 'learner' })); expect(draft.status).toBe(503); privateResponse(draft);
  });
  it('rejects learner detail carrying a private author sequence or a non-published lifecycle state', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    for (const announcement of [{ ...learnerView().announcement, sequence: 99 }, { ...learnerView().announcement, status: 'draft' }, { ...learnerView().announcement, published: null }]) {
      mocks.detail.mockResolvedValue({ ...learnerView(), announcement });
      const result = await run('detail', request('detail', { workspace: 'learner' })); expect(result.status).toBe(503); noLeak(await result.text());
    }
  });
  it('refuses mismatched class, announcement and pagination identities', async () => {
    mocks.classroom.mockResolvedValue({ ...classroom(), id: otherId }); expect((await run('classroom')).status).toBe(503);
    mocks.detail.mockResolvedValue({ ...view(), announcement: { ...view().announcement, id: otherId } }); expect((await run('detail')).status).toBe(503);
    mocks.list.mockResolvedValue({ ...list(), nextCursor: { at: date, id: otherId } });
    const badCursor = await run('list', request('list', { query: 'workspace=teach&limit=1' })); expect(badCursor.status).toBe(503);
  });
  it.each(mutations)('never acknowledges a malformed or foreign %s command receipt', async operation => {
    prepare(operation); const action = operation as 'save' | 'publish' | 'archive' | 'read';
    for (const corrupt of [{ actorId: otherId }, { classId: otherId }, { announcementId: otherId }, { action: 'wrong' },
      { id: 'bad' }, { createdAt: 'not-a-date' }, { sequence: 100 }, { revisionId: 'bad' }, { publicationSequence: 100 }]) {
      mocks[operation].mockResolvedValue({ ...receipt(action), ...corrupt }); const result = await run(operation);
      expect(result.status).toBe(503); privateResponse(result); noLeak(await result.text());
    }
  });
  it('requires the exact published revision in a publish receipt and null references on archive', async () => {
    mocks.publish.mockResolvedValue({ ...receipt('publish'), revisionId: otherId }); expect((await run('publish')).status).toBe(503);
    mocks.archive.mockResolvedValue({ ...receipt('archive'), revisionId }); expect((await run('archive')).status).toBe(503);
  });
});

describe('class portal server page access', () => {
  it('provides the explicit repository, current actor and database to server pages', async () => {
    const result = await readClassPortalData('admin', async (_repository, actor, db) => ({ actorId: actor.id, hasDb: Boolean(db) }));
    expect(result).toEqual({ status: 'authorized', data: { actorId, hasDb: true } });
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'administrator', userId: actorId });
  });
  it('keeps teaching principals owner-scoped even when the current user is an admin', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'admin' }] }); await readClassPortalData('teach', async () => null);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'instructor', userId: actorId });
  });
  it('distinguishes absent sessions and permission from operational failures', async () => {
    mocks.session.mockResolvedValue(null); expect(await readClassPortalData('learner', async () => null)).toEqual({ status: 'unauthenticated' });
    mocks.session.mockResolvedValue({ user: { id: actorId } }); mocks.roles.mockResolvedValue([]);
    expect(await readClassPortalData('admin', async () => null)).toEqual({ status: 'forbidden' });
    mocks.session.mockRejectedValue(new Error('PRIVATE_AUTH_OUTAGE')); await expect(readClassPortalData('learner', async () => null)).rejects.toThrow();
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true });
  });
  it('rejects invalid server-page workspaces before a database is opened', async () => {
    await expect(readClassPortalData('owner' as 'teach', async () => null)).rejects.toThrow(); expect(mocks.database).not.toHaveBeenCalled();
  });
});

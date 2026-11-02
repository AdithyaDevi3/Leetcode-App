import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionVersion } from '@leetcode-app/domain';
import type { StoredAssessmentDraft } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn(), roles: vi.fn(), principal: vi.fn(),
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), use: vi.fn(), destinations: vi.fn(), questions: vi.fn(),
  pool: [] as unknown[],
  AccessError: class AssessmentTemplateAccessError extends Error {},
  ValidationError: class AssessmentTemplateValidationError extends Error {},
  ConflictError: class AssessmentTemplateConflictError extends Error {
    constructor(readonly currentRevision?: number) { super('PRIVATE_TEMPLATE_CONFLICT_CANARY'); }
  },
  DraftAccessError: class AssessmentDraftAccessError extends Error {},
  DraftValidationError: class AssessmentDraftValidationError extends Error {},
  DraftConflictError: class AssessmentDraftConflictError extends Error {},
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  AssessmentTemplateAccessError: mocks.AccessError,
  AssessmentTemplateValidationError: mocks.ValidationError,
  AssessmentTemplateConflictError: mocks.ConflictError,
  AssessmentDraftAccessError: mocks.DraftAccessError,
  AssessmentDraftValidationError: mocks.DraftValidationError,
  AssessmentDraftConflictError: mocks.DraftConflictError,
  PostgresAdministrationRepository: class { listActiveRoles = mocks.roles; },
  PostgresAssessmentTemplateRepository: class {
    listTemplates = mocks.list; getTemplate = mocks.get; createFromDraft = mocks.create;
    updateTemplate = mocks.update; setArchived = mocks.archive; createDraft = mocks.use;
    constructor(database: unknown, principal: unknown) { mocks.principal(database, principal); }
  },
  PostgresAssessmentDraftRepository: class { listCopyDestinations = mocks.destinations; },
}));
vi.mock('./question-bank.server', async importOriginal => {
  const actual = await importOriginal<typeof import('./question-bank.server')>();
  mocks.pool = [...actual.getReviewedQuestionVersions()];
  return { ...actual, getReviewedQuestionVersions: mocks.questions };
});

import { GET as collectionGet, POST as collectionPost } from '@/app/api/assessments/templates/route';
import { GET as detailGet, POST as detailPost } from '@/app/api/assessments/templates/[templateId]/route';
import { POST as draftPost } from '@/app/api/assessments/templates/[templateId]/drafts/route';
import { readTemplateDetailPage, readTemplateLibraryPage } from './assessment-template-api';

const actorId = '11111111-1111-4111-8111-111111111111';
const otherActorId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-abcd-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const sourceDraftId = '55555555-abcd-4555-8555-555555555555';
const templateId = '66666666-abcd-4666-8666-666666666666';
const createdTemplateId = '77777777-7777-4777-8777-777777777777';
const createdDraftId = '88888888-8888-4888-8888-888888888888';
const key = '99999999-9999-4999-8999-999999999999';
const selection = [
  { questionVersionId: 'window-negative-initialization@1', maxUnits: 125 },
  { questionVersionId: 'pair-distinct-indices@1', maxUnits: 275 },
];
const content = () => ({ title: 'Synthetic private template', instructions: 'Choose the preserved invariant.', questions: selection });
const stored = () => ({ id: templateId, revision: 3, status: 'active' as const, currentVersion: 2, version: 2,
  ...content(), maxUnits: 400, createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T13:00:00.000Z', versionCreatedAt: '2026-11-01T13:00:00.000Z' });
const summary = () => ({ id: templateId, revision: 3, status: 'active', currentVersion: 2, title: content().title,
  questionCount: 2, maxUnits: 400, updatedAt: stored().updatedAt });
const created = () => ({ ...stored(), id: createdTemplateId, revision: 1, currentVersion: 1, version: 1 });
const draft = (): StoredAssessmentDraft => ({ id: createdDraftId, classId: destinationId, ...content(), revision: 1, status: 'draft',
  createdBy: actorId, maxUnits: 400, availableAt: null, dueAt: null, closesAt: null,
  createdAt: stored().createdAt, updatedAt: stored().updatedAt });
const createCommand = () => ({ operation: 'create_from_draft', sourceClassId: classId, sourceDraftId, expectedRevision: 3, requestKey: key });
const updateCommand = () => ({ operation: 'update', expectedRevision: 2, requestKey: key, content: content() });
const archiveCommand = () => ({ operation: 'set_archived', expectedRevision: 2, requestKey: key, archived: true });
const draftCommand = () => ({ version: 2, expectedRevision: 3, destinationClassId: destinationId, requestKey: key });
const context = (id = templateId) => ({ params: Promise.resolve({ templateId: id }) });

type Operation = 'library' | 'create' | 'detail' | 'update' | 'archive' | 'use';
const operations: Operation[] = ['library', 'create', 'detail', 'update', 'archive', 'use'];
function request(operation: Operation, options: { query?: string; owner?: string | null; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const method = ['library', 'detail'].includes(operation) ? 'GET' : 'POST';
  const path = operation === 'library' || operation === 'create' ? '/api/assessments/templates'
    : `/api/assessments/templates/${templateId}${operation === 'use' ? '/drafts' : ''}`;
  const headers: Record<string, string> = { ...options.headers };
  if (options.owner !== null) headers['x-assessment-author'] = options.owner ?? actorId;
  if (method === 'POST') headers['content-type'] = 'application/json';
  const body = options.raw ?? JSON.stringify(Object.hasOwn(options, 'body') ? options.body
    : operation === 'create' ? createCommand() : operation === 'update' ? updateCommand() : operation === 'archive' ? archiveCommand() : draftCommand());
  return new Request(`http://localhost${path}?${options.query ?? 'workspace=teach'}`, { method, headers, ...(method === 'POST' ? { body } : {}) });
}
const run = (operation: Operation, req = request(operation), id = templateId) => operation === 'library' ? collectionGet(req)
  : operation === 'create' ? collectionPost(req) : operation === 'detail' ? detailGet(req, context(id))
    : operation === 'use' ? draftPost(req, context(id)) : detailPost(req, context(id));
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-assessment-author');
}
const noWrites = () => { for (const write of [mocks.create, mocks.update, mocks.archive, mocks.use]) expect(write).not.toHaveBeenCalled(); };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: actorId, role: 'learner', displayName: 'Synthetic template author' } });
  mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] }); mocks.roles.mockResolvedValue(['administrator']);
  mocks.list.mockResolvedValue({ items: [summary()], total: 1 });
  mocks.get.mockImplementation(async (id: string, version?: number) => id === createdTemplateId ? created() : { ...stored(), version: version ?? 2 });
  mocks.create.mockResolvedValue(created()); mocks.update.mockResolvedValue(stored()); mocks.use.mockResolvedValue(draft());
  mocks.archive.mockImplementation(async () => { const accepted = { ...stored(), status: 'archived' }; mocks.get.mockResolvedValue(accepted); return accepted; });
  mocks.destinations.mockResolvedValue([{ id: classId, name: 'Synthetic source class' }, { id: destinationId, name: 'Synthetic destination class' }]);
  mocks.questions.mockReturnValue(mocks.pool);
});

describe('private template identity and permission boundaries', () => {
  it.each(operations)('requires authentication before reading input or opening storage for %s', async operation => {
    mocks.session.mockResolvedValue(null);
    const response = await run(operation, request(operation, { query: 'workspace=invalid', raw: 'PRIVATE_MALFORMED_BODY' }), 'invalid');
    expect(response.status).toBe(401); privateResponse(response);
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true }); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it.each(operations)('fails closed and sanitizes a session outage for %s', async operation => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_CANARY'));
    const response = await run(operation);
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain('PRIVATE_SESSION'); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it.each([null, '', otherActorId, 'invalid-owner'])('requires an exact HTTP author header (%s)', async owner => {
    for (const operation of operations) {
      const response = await run(operation, request(operation, { owner, query: 'workspace=invalid' }));
      expect(response.status).toBe(409); privateResponse(response); expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    }
    expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it('does not turn mutable session claims into stored instructor authority', async () => {
    mocks.session.mockResolvedValue({ user: { id: actorId, role: 'administrator' } }); mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    for (const operation of operations) { const response = await run(operation); expect(response.status).toBe(403); privateResponse(response); }
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled(); noWrites();
  });

  it('passes the verified creator identity to the instructor repository', async () => {
    const response = await run('library'); expect(response.status).toBe(200);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { userId: actorId, role: 'instructor' });
    expect(mocks.close).toHaveBeenCalledOnce(); noWrites();
  });

  it.each([[], ['content_author'], ['content_reviewer'], ['support'], ['privacy_operator']].map(roles => ({ roles })))('denies administrator roles without classes.manage: $roles', async ({ roles }) => {
    mocks.roles.mockResolvedValue(roles);
    const response = await run('detail', request('detail', { query: 'workspace=admin' }));
    expect(response.status).toBe(403); privateResponse(response); expect(mocks.get).not.toHaveBeenCalled(); noWrites();
  });

  it('retains creator ownership checks for a platform administrator', async () => {
    mocks.get.mockRejectedValue(new mocks.AccessError('PRIVATE_OTHER_CREATOR_TEMPLATE'));
    const response = await run('detail', request('detail', { query: 'workspace=admin' }));
    expect(response.status).toBe(404); privateResponse(response); expect(await response.text()).not.toContain('PRIVATE_OTHER_CREATOR');
    expect(mocks.roles).toHaveBeenCalledWith(actorId);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { userId: actorId, role: 'administrator' });
    expect(mocks.destinations).not.toHaveBeenCalled(); noWrites();
  });

  it.each(['create', 'update', 'archive', 'use'] as const)('keeps repository ownership or destination denial opaque for %s', async operation => {
    mocks[operation].mockRejectedValue(new mocks.AccessError('PRIVATE_SCOPE_CANARY'));
    const response = await run(operation);
    expect(response.status).toBe(404); privateResponse(response); expect(await response.text()).not.toContain('PRIVATE_SCOPE');
  });
});

describe('template list, detail and safe question projections', () => {
  it('returns an explicit creator-library summary without private stored fields', async () => {
    mocks.list.mockResolvedValue({ items: [{ ...summary(), ownerId: otherActorId, instructions: 'PRIVATE_INSTRUCTIONS', joinCode: 'PRIVATE_JOIN' }], total: 41 });
    const response = await run('library', request('library', { query: 'workspace=teach&search=invariant&status=all&page=2' }));
    expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(body).toMatchObject({ actorId, total: 41, page: 2, pageSize: 20 });
    expect(Object.keys(body).sort()).toEqual(['actorId', 'items', 'page', 'pageSize', 'total']);
    expect(Object.keys(body.items[0]).sort()).toEqual(['currentVersion', 'id', 'maxUnits', 'questionCount', 'revision', 'status', 'title', 'updatedAt']);
    expect(mocks.list).toHaveBeenCalledWith({ search: 'invariant', status: 'all', page: 2 });
    expect(JSON.stringify(body)).not.toContain('PRIVATE_'); expect(JSON.stringify(body)).not.toContain(otherActorId); noWrites();
  });

  it('projects exact question versions and metadata while withholding keys, notes and learner records', async () => {
    const canary = { ownerId: otherActorId, sourceClassId: classId, privateNote: 'PRIVATE_TEMPLATE_NOTE', learnerId: otherActorId };
    mocks.get.mockResolvedValue({ ...stored(), ...canary, questions: selection.map(item => ({ ...item, correctOptionId: 'PRIVATE_KEY' })) });
    mocks.destinations.mockResolvedValue([{ id: destinationId, name: 'Synthetic destination class', joinCode: 'PRIVATE_JOIN', learners: [canary] }]);
    const response = await run('detail'); expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['actorId', 'catalog', 'destinations', 'template']);
    expect(Object.keys(body.template).sort()).toEqual(['createdAt', 'currentVersion', 'id', 'instructions', 'maxUnits', 'questions', 'revision', 'status', 'title', 'updatedAt', 'version', 'versionCreatedAt']);
    expect(body.template.questions.map((item: { questionVersionId: string; maxUnits: number }) => ({ questionVersionId: item.questionVersionId, maxUnits: item.maxUnits }))).toEqual(selection);
    for (const item of body.template.questions) expect(Object.keys(item).sort()).toEqual(['maxUnits', 'question', 'questionVersionId']);
    for (const question of [...body.catalog, ...body.template.questions.map((item: { question: unknown }) => item.question)]) {
      expect(Object.keys(question).sort()).toEqual(['activityIds', 'conceptIds', 'difficulty', 'kind', 'options', 'prompt', 'questionId', 'title', 'version', 'versionId']);
      for (const option of question.options) expect(Object.keys(option).sort()).toEqual(['id', 'text']);
    }
    expect(body.destinations).toEqual([{ id: destinationId, name: 'Synthetic destination class' }]);
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE_|ownerId|sourceClassId|learnerId|joinCode|correctOptionId|misconceptionTags|reviewerId/); noWrites();
  });

  it('reads a historical immutable version explicitly without substituting the current version', async () => {
    const response = await run('detail', request('detail', { query: 'workspace=teach&version=1' }));
    expect(response.status).toBe(200); const body = await response.json();
    expect(body.template).toMatchObject({ id: templateId, version: 1, currentVersion: 2, revision: 3 });
    expect(mocks.get).toHaveBeenCalledWith(templateId, 1); noWrites();
  });

  it('retains unavailable exact references as repair placeholders and filters retired catalog entries', async () => {
    mocks.questions.mockReturnValue((mocks.pool as QuestionVersion[]).map(question => question.versionId === selection[0].questionVersionId ? { ...question, status: 'retired' } : question));
    const response = await run('detail'); expect(response.status).toBe(200);
    const body = await response.json(); expect(body.template.questions[0]).toEqual({ ...selection[0], question: null });
    expect(body.catalog.some((question: { versionId: string }) => question.versionId === selection[0].questionVersionId)).toBe(false);
    expect(body.template.questions[1].question.versionId).toBe(selection[1].questionVersionId); noWrites();
  });

  it('keeps an archived owner template readable without implying publication', async () => {
    mocks.get.mockResolvedValue({ ...stored(), status: 'archived' });
    const response = await run('detail'); expect(response.status).toBe(200);
    expect((await response.json()).template.status).toBe('archived'); noWrites();
  });

  it('refuses detail data identifying another template or a different selected version', async () => {
    mocks.get.mockResolvedValue({ ...stored(), id: createdTemplateId });
    const first = await run('detail'); expect([404, 503]).toContain(first.status); expect(await first.text()).not.toContain(content().title);
    mocks.get.mockResolvedValue(stored());
    const second = await run('detail', request('detail', { query: 'workspace=teach&version=1' }));
    expect([404, 503]).toContain(second.status); expect(await second.text()).not.toContain(content().title);
  });
});

describe('template commands preserve receipt identity and immutable content', () => {
  it('creates only an explicit template from the acknowledged source revision', async () => {
    const response = await run('create'); expect(response.status).toBe(201); privateResponse(response);
    const body = await response.json(); expect(body.actorId).toBe(actorId); expect(body.template.id).toBe(createdTemplateId);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ sourceDraftId, sourceClassId: classId, expectedRevision: 3, requestKey: key }), (mocks.pool as QuestionVersion[]).map(question => question.versionId));
    expect(mocks.use).not.toHaveBeenCalled();
  });

  it('forwards an exact content update without trusting client answer keys or scores', async () => {
    const response = await run('update'); expect(response.status).toBe(200); privateResponse(response);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ templateId, expectedRevision: 2, requestKey: key, content: content() }), (mocks.pool as QuestionVersion[]).map(question => question.versionId));
    expect(mocks.use).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('sends archival as its own revisioned command without changing a content version', async () => {
    const response = await run('archive'); expect(response.status).toBe(200); privateResponse(response);
    expect(mocks.archive).toHaveBeenCalledWith(expect.objectContaining({ templateId, expectedRevision: 2, requestKey: key, archived: true }));
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.use).not.toHaveBeenCalled();
  });

  it('restores an archived head with an explicit false flag and the same pinned content version', async () => {
    mocks.archive.mockResolvedValue(stored());
    const response = await run('archive', request('archive', { body: { ...archiveCommand(), archived: false } }));
    expect(response.status).toBe(200);
    expect((await response.json()).template).toMatchObject({ status: 'active', version: 2, currentVersion: 2 });
    expect(mocks.archive).toHaveBeenCalledWith(expect.objectContaining({ templateId, archived: false, expectedRevision: 2, requestKey: key }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('uses a pinned version and explicit authorized class to create only a normal private draft receipt', async () => {
    const response = await run('use'); expect(response.status).toBe(201); privateResponse(response);
    expect(await response.json()).toEqual({ actorId, draftId: createdDraftId, classId: destinationId });
    expect(mocks.use).toHaveBeenCalledWith(expect.objectContaining({ templateId, ...draftCommand() }), (mocks.pool as QuestionVersion[]).map(question => question.versionId));
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('forwards an explicitly selected historical version rather than replacing it with the current version', async () => {
    const response = await run('use', request('use', { body: { ...draftCommand(), version: 1 } }));
    expect(response.status).toBe(201);
    expect(mocks.use).toHaveBeenCalledWith(expect.objectContaining({ templateId, version: 1, expectedRevision: 3, destinationClassId: destinationId, requestKey: key }), expect.any(Array));
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each(['create', 'update', 'use'] as const)('delegates %s replay before checking current catalog eligibility', async operation => {
    mocks.questions.mockReturnValue([]);
    const response = await run(operation); expect(response.status).toBe(operation === 'update' ? 200 : 201);
    const mutation = operation === 'create' ? mocks.create : operation === 'update' ? mocks.update : mocks.use;
    expect(mutation).toHaveBeenCalledWith(expect.objectContaining({ requestKey: key }), []);
  });

  it('returns the original mutation receipt while reporting a newer current head', async () => {
    mocks.update.mockResolvedValue(stored()); mocks.get.mockResolvedValue({ ...stored(), revision: 7, currentVersion: 5, version: 5, title: 'Newer synthetic private template' });
    const response = await run('update'); expect(response.status).toBe(200);
    const body = await response.json(); expect(body.template).toMatchObject({ revision: 3, currentVersion: 2, version: 2, title: content().title });
    expect(body.currentRevision).toBe(7);
  });

  it.each([
    { revision: 2 }, { version: 2 }, { currentVersion: 2 }, { status: 'archived' }, { id: sourceDraftId },
  ])('rejects an inconsistent first template-capture receipt (%j)', async changed => {
    mocks.create.mockResolvedValue({ ...created(), ...changed });
    const response = await run('create'); expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain(content().title);
  });

  it.each([
    ['update', { revision: 4 }], ['update', { status: 'archived' }], ['update', { id: createdTemplateId }],
    ['archive', { revision: 2 }], ['archive', { status: 'active' }], ['archive', { id: createdTemplateId }],
  ] as const)('rejects an inconsistent %s receipt (%j)', async (operation, changed) => {
    mocks[operation].mockResolvedValue({ ...stored(), status: operation === 'archive' ? 'archived' : 'active', ...changed });
    const response = await run(operation); expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain(content().title);
  });

  it('does not confirm an accepted receipt against a mismatched or older current head', async () => {
    mocks.get.mockResolvedValue({ ...stored(), revision: 2 });
    const older = await run('update'); expect(older.status).toBe(503);
    mocks.get.mockResolvedValue({ ...stored(), id: createdTemplateId });
    const different = await run('update'); expect(different.status).toBe(503);
    expect(await different.text()).not.toContain(content().title);
  });

  it.each(['create', 'update', 'archive', 'use'] as const)('reports a safe reviewable conflict for %s without exposing stored details', async operation => {
    mocks[operation].mockRejectedValue(new mocks.ConflictError(5));
    const response = await run(operation); expect(response.status).toBe(409); privateResponse(response);
    const body = await response.json(); expect(['template_conflict', 'source_conflict']).toContain(body.code); expect(JSON.stringify(body)).not.toContain('PRIVATE_');
  });

  it.each(['classId', 'createdBy', 'status', 'availableAt', 'id'] as const)('refuses a mismatched or non-private draft receipt (%s)', async field => {
    const value = field === 'classId' ? classId : field === 'createdBy' ? otherActorId : field === 'status' ? 'published' : field === 'availableAt' ? stored().createdAt : 'not-a-valid-id';
    mocks.use.mockResolvedValue({ ...draft(), [field]: value });
    const response = await run('use'); expect(response.status).toBe(503); expect(await response.text()).not.toContain(createdDraftId);
  });
});

describe('strict bounded template request parsing and sanitized failures', () => {
  it.each(['', 'workspace=learner', 'workspace=teach&workspace=admin', 'workspace=teach&ownerId=foreign', 'workspace=teach&page=0', 'workspace=teach&page=1.5', 'workspace=teach&page=9007199254740992', 'workspace=teach&status=published', 'workspace=teach&search=x&search=y'])('rejects ambiguous library input before storage: %s', async query => {
    const response = await run('library', request('library', { query })); expect(response.status).toBe(400); privateResponse(response); expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each(['workspace=teach&version=0', 'workspace=teach&version=1.5', 'workspace=teach&version=1&version=2', 'workspace=teach&status=all'])('rejects ambiguous detail input: %s', async query => {
    const response = await run('detail', request('detail', { query })); expect(response.status).toBe(400); expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each(['create', 'update', 'archive', 'use'] as const)('does not accept read-only or unknown query fields for %s', async operation => {
    const response = await run(operation, request(operation, { query: 'workspace=teach&version=1' })); expect(response.status).toBe(400); noWrites();
  });

  it.each(['detail', 'update', 'archive', 'use'] as const)('requires a canonicalizable valid template identity for %s', async operation => {
    const response = await run(operation, request(operation), 'invalid'); expect(response.status).toBe(400); noWrites();
  });

  const invalid = [
    ['create', { ...createCommand(), sourceDraftId: 'invalid' }], ['create', { ...createCommand(), sourceClassId: 'invalid' }],
    ['create', { ...createCommand(), ownerId: otherActorId }], ['create', { ...createCommand(), title: 'Client injected source title' }],
    ['update', { ...updateCommand(), expectedRevision: 0 }], ['update', { ...updateCommand(), content: { ...content(), title: 'x' } }],
    ['update', { ...updateCommand(), content: { ...content(), instructions: 'x'.repeat(2001) } }],
    ['update', { ...updateCommand(), content: { ...content(), questions: [] } }],
    ['update', { ...updateCommand(), content: { ...content(), questions: [selection[0], selection[0]] } }],
    ['update', { ...updateCommand(), content: { ...content(), questions: [selection[0], { ...selection[0], questionVersionId: 'window-negative-initialization@2' }] } }],
    ['update', { ...updateCommand(), content: { ...content(), questions: [{ ...selection[0], maxUnits: 1.25 }] } }],
    ['update', { ...updateCommand(), content: { ...content(), questions: selection.map(item => ({ ...item, maxUnits: 600_000 })) } }],
    ['update', { ...updateCommand(), content: { ...content(), questions: [{ ...selection[0], correctOptionId: 'PRIVATE_KEY' }] } }],
    ['update', { ...updateCommand(), content: { ...content(), audience: [otherActorId] } }],
    ['archive', { ...archiveCommand(), archived: 'true' }], ['archive', { ...archiveCommand(), content: content() }],
    ['use', { ...draftCommand(), version: 0 }], ['use', { ...draftCommand(), destinationClassId: 'invalid' }],
    ['use', { ...draftCommand(), audience: [otherActorId] }], ['use', { ...draftCommand(), availableAt: stored().createdAt }],
    ['use', { ...draftCommand(), requestKey: '' }], ['use', { ...draftCommand(), requestKey: 'x'.repeat(129) }],
  ] as const;
  it.each(invalid)('rejects invalid %s command fields before mutation (%j)', async (operation, body) => {
    const response = await run(operation, request(operation, { body })); expect(response.status).toBe(400); privateResponse(response); noWrites();
  });

  it.each(['create', 'update', 'archive', 'use'] as const)('rejects duplicate JSON keys and malformed JSON for %s', async operation => {
    for (const raw of ['{', 'PRIVATE_INVALID_JSON', '{"requestKey":"one","requestKey":"two"}']) {
      const response = await run(operation, request(operation, { raw })); expect(response.status).toBe(400); privateResponse(response); expect(await response.text()).not.toContain('PRIVATE_INVALID');
    }
    noWrites();
  });

  it('limits UTF-8 bytes rather than JavaScript characters or an omitted Content-Length', async () => {
    const raw = JSON.stringify({ ...updateCommand(), content: { ...content(), instructions: 'é'.repeat(16_001) } });
    const response = await run('update', request('update', { raw })); expect(response.status).toBe(413); privateResponse(response); noWrites();
  });

  it.each(['list', 'get', 'create', 'update', 'archive', 'use', 'query', 'close'] as const)('sanitizes %s service failures', async operation => {
    mocks[operation].mockRejectedValue(new Error('PRIVATE_DATABASE_CANARY'));
    const target: Operation = operation === 'list' ? 'library' : operation === 'get' ? 'detail' : ['create', 'update', 'archive', 'use'].includes(operation) ? operation as Operation : 'use';
    const response = await run(target); expect(response.status).toBe(503); privateResponse(response); expect(await response.text()).not.toContain('PRIVATE_DATABASE');
  });

  it('canonicalizes UUIDs without changing the pinned version or request identity', async () => {
    const response = await run('detail', request('detail', { query: 'workspace=teach&version=1' }), templateId.toUpperCase()); expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(templateId, 1);
    const saved = await run('create', request('create', { body: { ...createCommand(), sourceClassId: classId.toUpperCase(), sourceDraftId: sourceDraftId.toUpperCase() } }));
    expect(saved.status).toBe(201); expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ sourceClassId: classId, sourceDraftId, requestKey: key }), expect.any(Array));
  });
});

describe('server page authorization', () => {
  it('authorizes the library internally without a browser owner header', async () => {
    const access = await readTemplateLibraryPage('teach'); expect(access).toMatchObject({ status: 'authorized', actorId }); noWrites();
  });

  it('authorizes the private detail and returns only route identity', async () => {
    const access = await readTemplateDetailPage('teach', templateId); expect(access).toMatchObject({ status: 'authorized', actorId, templateId }); noWrites();
  });

  it('distinguishes absent identity, forbidden author role and inaccessible private template', async () => {
    mocks.session.mockResolvedValue(null); expect(await readTemplateLibraryPage('teach')).toEqual({ status: 'unauthenticated' });
    mocks.session.mockResolvedValue({ user: { id: actorId } }); mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    expect(await readTemplateLibraryPage('teach')).toEqual({ status: 'forbidden' });
    mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] }); mocks.get.mockRejectedValue(new mocks.AccessError());
    expect(await readTemplateDetailPage('teach', templateId)).toEqual({ status: 'not_found' }); noWrites();
  });

  it('throws an authorization outage instead of returning a cached or apparently missing template', async () => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_OUTAGE'));
    await expect(readTemplateDetailPage('teach', templateId)).rejects.toThrow(); expect(mocks.get).not.toHaveBeenCalled(); noWrites();
  });
});

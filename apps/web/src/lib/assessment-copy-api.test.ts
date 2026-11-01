import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuestionVersion } from '@leetcode-app/domain';
import type { StoredAssessmentDraft } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn(), roles: vi.fn(), construct: vi.fn(),
  source: vi.fn(), destinations: vi.fn(), copy: vi.fn(), questions: vi.fn(), pool: [] as unknown[],
  AccessError: class AssessmentDraftAccessError extends Error {},
  ValidationError: class AssessmentDraftValidationError extends Error {},
  ConflictError: class AssessmentDraftConflictError extends Error {
    constructor(readonly currentRevision?: number) { super('PRIVATE_CONFLICT_CANARY'); }
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  AssessmentDraftAccessError: mocks.AccessError,
  AssessmentDraftConflictError: mocks.ConflictError,
  AssessmentDraftValidationError: mocks.ValidationError,
  PostgresAdministrationRepository: class { listActiveRoles = mocks.roles; },
  PostgresAssessmentDraftRepository: class {
    getDraft = mocks.source; listCopyDestinations = mocks.destinations; copyDraft = mocks.copy;
    constructor(database: unknown, principal: unknown) { mocks.construct(database, principal); }
  },
}));
vi.mock('./question-bank.server', async importOriginal => {
  const actual = await importOriginal<typeof import('./question-bank.server')>();
  mocks.pool = [...actual.getReviewedQuestionVersions()];
  return { ...actual, getReviewedQuestionVersions: mocks.questions,
    getReviewedQuestionVersion: (id: string) => (mocks.questions() as QuestionVersion[]).find(question => question.versionId === id) ?? null };
});

import { GET, POST } from '@/app/api/assessments/drafts/[draftId]/copy/route';
import { readAssessmentCopyPage } from './assessment-copy-api';

const actorId = '11111111-1111-4111-8111-111111111111';
const otherActorId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-abcd-4333-8333-333333333333';
const destinationId = '44444444-4444-4444-8444-444444444444';
const draftId = '55555555-abcd-4555-8555-555555555555';
const copyId = '66666666-6666-4666-8666-666666666666';
const key = '77777777-7777-4777-8777-777777777777';
const selection = [
  { questionVersionId: 'window-negative-initialization@1', maxUnits: 125 },
  { questionVersionId: 'pair-distinct-indices@1', maxUnits: 275 },
];
function source(): StoredAssessmentDraft {
  return { id: draftId, classId, title: 'Synthetic saved quiz', instructions: 'Choose the preserved invariant.',
    questions: selection, availableAt: '2026-10-31T09:00:00.000Z', dueAt: '2026-11-01T09:00:00.000Z', closesAt: '2026-11-02T09:00:00.000Z',
    revision: 3, status: 'draft', maxUnits: 400, createdBy: otherActorId,
    createdAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-31T12:00:00.000Z' };
}
function copied(): StoredAssessmentDraft {
  return { ...source(), id: copyId, classId: destinationId, title: 'Copy of Synthetic saved quiz', revision: 1,
    createdBy: actorId, availableAt: null, dueAt: null, closesAt: null };
}
const command = () => ({ sourceClassId: classId, destinationClassId: destinationId, expectedRevision: 3, requestKey: key });
function request(method: 'GET' | 'POST' = 'GET', options: { query?: string; owner?: string | null; body?: unknown; raw?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.owner !== null) headers['x-assessment-author'] = options.owner ?? actorId;
  if (method === 'POST') headers['content-type'] = 'application/json';
  return new Request(`http://localhost/api/assessments/drafts/${draftId}/copy?${options.query ?? (method === 'GET' ? `workspace=teach&classId=${classId}` : 'workspace=teach')}`, {
    method, headers, ...(method === 'POST' ? { body: options.raw ?? JSON.stringify(options.body ?? command()) } : {}),
  });
}
const context = (id = draftId) => ({ params: Promise.resolve({ draftId: id }) });
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-assessment-author');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: actorId, role: 'learner', displayName: 'Synthetic author' } });
  mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] });
  mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  mocks.roles.mockResolvedValue(['administrator']);
  mocks.source.mockResolvedValue(source());
  mocks.destinations.mockResolvedValue([{ id: classId, name: 'Synthetic source class' }, { id: destinationId, name: 'Synthetic destination class' }]);
  mocks.copy.mockResolvedValue(copied());
  mocks.questions.mockReturnValue(mocks.pool);
});

describe('quiz copy identity and authorization boundaries', () => {
  it('previews an explicitly scoped saved version without creating work', async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(body.actorId).toBe(actorId);
    expect(body.source).toMatchObject({ id: draftId, classId, className: 'Synthetic source class', revision: 3,
      title: source().title, instructions: source().instructions });
    expect(body.source.questions.map((item: { questionVersionId: string; maxUnits: number }) => ({ questionVersionId: item.questionVersionId, maxUnits: item.maxUnits }))).toEqual(selection);
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true });
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), { role: 'instructor', userId: actorId });
    expect(mocks.source).toHaveBeenCalledWith(draftId);
    expect(mocks.copy).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(['GET', 'POST'] as const)('denies an unauthenticated %s before parsing or opening storage', async method => {
    mocks.session.mockResolvedValue(null);
    const response = await (method === 'GET' ? GET : POST)(request(method, { query: 'workspace=invalid', raw: 'PRIVATE_INVALID_BODY' }), context('invalid'));
    expect(response.status).toBe(401); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'] as const)('fails closed when %s cannot verify the session', async method => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_CANARY'));
    const response = await (method === 'GET' ? GET : POST)(request(method), context());
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain('PRIVATE_SESSION'); expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([null, '', otherActorId, 'invalid-owner'])('requires the exact original HTTP owner (%s)', async owner => {
    for (const method of ['GET', 'POST'] as const) {
      const response = await (method === 'GET' ? GET : POST)(request(method, { owner, query: 'workspace=invalid' }), context('invalid'));
      expect(response.status).toBe(409); privateResponse(response);
      expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    }
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('does not treat mutable session role claims as instructor authority', async () => {
    mocks.session.mockResolvedValue({ user: { id: actorId, role: 'administrator', displayName: 'instructor' } });
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    for (const method of ['GET', 'POST'] as const) {
      const response = await (method === 'GET' ? GET : POST)(request(method), context());
      expect(response.status).toBe(403); privateResponse(response);
    }
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('selects the independently checked administrator scope for admin copies', async () => {
    const response = await POST(request('POST', { query: 'workspace=admin' }), context());
    expect(response.status).toBe(201); privateResponse(response);
    expect(mocks.roles).toHaveBeenCalledWith(actorId);
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), { role: 'administrator', userId: actorId });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([[], ['content_author'], ['content_reviewer'], ['support'], ['privacy_operator']].map(roles => ({ roles })))('denies admin roles without class-management permission: $roles', async ({ roles }) => {
    mocks.roles.mockResolvedValue(roles);
    const response = await POST(request('POST', { query: 'workspace=admin' }), context());
    expect(response.status).toBe(403); privateResponse(response);
    expect(mocks.copy).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(['source', 'copy'] as const)('keeps repository %s scope denials opaque', async operation => {
    mocks[operation].mockRejectedValue(new mocks.AccessError('PRIVATE_CLASS_CANARY'));
    const response = operation === 'source' ? await GET(request(), context()) : await POST(request('POST'), context());
    expect(response.status).toBe(404); privateResponse(response);
    expect(await response.text()).not.toContain('PRIVATE_CLASS'); expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('bounded quiz copy input and safe failures', () => {
  it.each([
    '', 'workspace=learner', `workspace=teach&workspace=admin&classId=${classId}`,
    'workspace=teach', `workspace=teach&classId=${classId}&classId=${destinationId}`,
    `workspace=teach&classId=${classId}&actorId=${otherActorId}`, 'workspace=teach&classId=not-a-class',
  ])('rejects ambiguous GET input before storage: %s', async query => {
    const response = await GET(request('GET', { query }), context());
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each(['', 'workspace=learner', 'workspace=teach&workspace=admin', `workspace=teach&classId=${classId}`, 'workspace=teach&publish=true'])('rejects ambiguous POST query input: %s', async query => {
    const response = await POST(request('POST', { query }), context());
    expect(response.status).toBe(400); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it.each([
    null, [], {}, { ...command(), sourceClassId: 'not-a-class' }, { ...command(), destinationClassId: otherActorId.replaceAll('-', '') },
    { ...command(), expectedRevision: 0 }, { ...command(), expectedRevision: 1.25 }, { ...command(), expectedRevision: '3' },
    { ...command(), requestKey: '' }, { ...command(), requestKey: 'k'.repeat(129) },
    { ...command(), draft: source() }, { ...command(), audience: [otherActorId] }, { ...command(), title: 'PRIVATE_CHANGED_TITLE' },
    { ...command(), availableQuestionVersionIds: selection.map(item => item.questionVersionId) },
    { ...command(), grade: { earnedUnits: 400 } },
  ])('rejects malformed or extra command fields without mutation: %j', async body => {
    const response = await POST(request('POST', { raw: JSON.stringify(body) }), context());
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it.each(['{', 'PRIVATE_INVALID_JSON'])('sanitizes invalid JSON: %s', async raw => {
    const response = await POST(request('POST', { raw }), context());
    expect(response.status).toBe(400); privateResponse(response);
    expect(await response.text()).not.toContain('PRIVATE_INVALID'); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('rejects repeated JSON command fields rather than accepting their final value', async () => {
    const raw = JSON.stringify(command()).replace(`"sourceClassId":"${classId}"`, `"sourceClassId":"${destinationId}","sourceClassId":"${classId}"`);
    const response = await POST(request('POST', { raw }), context());
    expect(response.status).toBe(400); privateResponse(response); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('bounds the actual body instead of trusting content length', async () => {
    const raw = JSON.stringify({ ...command(), requestKey: 'é'.repeat(2100) });
    const response = await POST(request('POST', { raw }), context());
    expect(response.status).toBe(413); privateResponse(response); expect(mocks.copy).not.toHaveBeenCalled();
  });

  it.each(['invalid', '', '00000000-0000-0000-0000-000000000000'])('rejects invalid source identities: %s', async id => {
    const response = await POST(request('POST'), context(id));
    expect(response.status).toBe(400); expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each(['query', 'copy', 'close'] as const)('sanitizes a %s failure without inventing a successful receipt', async operation => {
    mocks[operation].mockRejectedValue(new Error('PRIVATE_DATABASE_CANARY'));
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain('PRIVATE_DATABASE'); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('reports a stale source revision as a reviewable conflict without returning private error details', async () => {
    mocks.copy.mockRejectedValue(new mocks.ConflictError(4));
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(409); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'source_conflict' });
  });
});

describe('copy projection, catalog and stable command handling', () => {
  it('projects question and class metadata explicitly without answer keys or source lineage', async () => {
    const canary = { learnerId: otherActorId, privateNote: 'PRIVATE_NOTE_CANARY', correctOptionId: 'PRIVATE_KEY_CANARY', sourceId: 'PRIVATE_SOURCE_CANARY' };
    mocks.source.mockResolvedValue({ ...source(), ...canary, questions: selection.map(item => ({ ...item, ...canary })) });
    mocks.destinations.mockResolvedValue([
      { id: classId, name: 'Synthetic source class', joinCode: 'PRIVATE_JOIN_CANARY', learners: [canary] },
      { id: destinationId, name: 'Synthetic destination class', ...canary },
    ]);
    const response = await GET(request(), context()); const body = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['actorId', 'destinations', 'source']);
    expect(Object.keys(body.source).sort()).toEqual(['classId', 'className', 'id', 'instructions', 'questions', 'revision', 'title']);
    for (const classroom of body.destinations) expect(Object.keys(classroom).sort()).toEqual(['id', 'name']);
    for (const item of body.source.questions) {
      expect(Object.keys(item).sort()).toEqual(['maxUnits', 'question', 'questionVersionId']);
      expect(item.question).not.toHaveProperty('correctOptionId'); expect(item.question).not.toHaveProperty('explanation');
      expect(item.question).not.toHaveProperty('review'); expect(item.question).not.toHaveProperty('provenance');
      for (const option of item.question.options) expect(Object.keys(option).sort()).toEqual(['id', 'text']);
    }
    expect(JSON.stringify(body)).not.toContain('PRIVATE_');
    expect(JSON.stringify(body)).not.toMatch(/learnerId|createdBy|availableAt|dueAt|closesAt|joinCode|misconceptionTags/);
  });

  it('does not silently replace a missing or retired source question with a different version', async () => {
    mocks.questions.mockReturnValue((mocks.pool as QuestionVersion[]).filter(question => question.versionId !== selection[0].questionVersionId));
    const response = await GET(request(), context()); const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.source.questions[0]).toEqual({ ...selection[0], question: null });
    expect(body.source.questions[1].question.versionId).toBe(selection[1].questionVersionId);
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('keeps explicitly retired catalog versions outside preview and new-copy eligibility', async () => {
    mocks.questions.mockReturnValue((mocks.pool as QuestionVersion[]).map(question => question.versionId === selection[0].questionVersionId ? { ...question, status: 'retired' } : question));
    const response = await GET(request(), context());
    expect((await response.json()).source.questions[0]).toEqual({ ...selection[0], question: null });
    await POST(request('POST'), context());
    expect(mocks.copy.mock.calls[0][1]).not.toContain(selection[0].questionVersionId);
  });

  it('forwards only server-owned reviewed version IDs and the unchanged request identity', async () => {
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(201); privateResponse(response);
    expect(await response.json()).toEqual({ actorId, draftId: copyId, classId: destinationId });
    expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({
      sourceDraftId: draftId, ...command(), reason: expect.any(String),
    }), (mocks.pool as QuestionVersion[]).map(question => question.versionId));
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it('delegates replay to the repository before enforcing changed source or catalog eligibility', async () => {
    mocks.questions.mockReturnValue([]);
    mocks.source.mockRejectedValue(new Error('PRIVATE_MUST_NOT_READ_SOURCE_AGAIN'));
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ actorId, draftId: copyId, classId: destinationId });
    expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining(command()), []);
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it('refuses a preview whose saved source belongs to another class', async () => {
    mocks.source.mockResolvedValue({ ...source(), classId: destinationId });
    const response = await GET(request(), context());
    expect([404, 503]).toContain(response.status); expect(await response.text()).not.toContain(source().title);
  });

  it('refuses a preview whose source identity changed', async () => {
    mocks.source.mockResolvedValue({ ...source(), id: copyId });
    const response = await GET(request(), context());
    expect([404, 503]).toContain(response.status); expect(await response.text()).not.toContain(source().title);
  });

  it('does not return a copy receipt for a different destination', async () => {
    mocks.copy.mockResolvedValue({ ...copied(), classId });
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain(copyId);
  });

  it('never identifies the original draft as its own copy', async () => {
    mocks.copy.mockResolvedValue({ ...copied(), id: draftId });
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain(source().title);
  });

  it('rejects a copy receipt created for a different actor', async () => {
    mocks.copy.mockResolvedValue({ ...copied(), createdBy: otherActorId });
    const response = await POST(request('POST'), context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain(copyId);
  });

  it('canonicalizes source identities without changing question ordering or the command key', async () => {
    const response = await GET(request('GET', { query: `workspace=teach&classId=${classId.toUpperCase()}` }), context(draftId.toUpperCase()));
    expect(response.status).toBe(200); expect((await response.json()).source.id).toBe(draftId);
    const saved = await POST(request('POST', { body: { ...command(), sourceClassId: classId.toUpperCase() } }), context(draftId.toUpperCase()));
    expect(saved.status).toBe(201);
    expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({ sourceDraftId: draftId, sourceClassId: classId, requestKey: key }), expect.any(Array));
  });
});

describe('copy page authorization and failure handling', () => {
  it('provides the same safe preview after internal authentication without an HTTP owner header', async () => {
    const access = await readAssessmentCopyPage('teach', classId, draftId);
    expect(access.status).toBe('authorized');
    if (access.status === 'authorized') expect(access.data.source.id).toBe(draftId);
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('distinguishes absent authentication, forbidden role and hidden source scope', async () => {
    mocks.session.mockResolvedValue(null);
    expect(await readAssessmentCopyPage('teach', classId, draftId)).toEqual({ status: 'unauthenticated' });
    mocks.session.mockResolvedValue({ user: { id: actorId } }); mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    expect(await readAssessmentCopyPage('teach', classId, draftId)).toEqual({ status: 'forbidden' });
    mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] }); mocks.source.mockRejectedValue(new mocks.AccessError());
    expect(await readAssessmentCopyPage('teach', classId, draftId)).toEqual({ status: 'not_found' });
  });

  it('does not turn an authorization outage into a missing-source result or leak a cached preview', async () => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_OUTAGE'));
    await expect(readAssessmentCopyPage('teach', classId, draftId)).rejects.toThrow();
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.copy).not.toHaveBeenCalled();
  });
});

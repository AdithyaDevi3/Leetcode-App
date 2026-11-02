import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn(), roles: vi.fn(), principal: vi.fn(),
  list: vi.fn(), get: vi.fn(), saveDraft: vi.fn(), author: vi.fn(), publish: vi.fn(), learner: vi.fn(), save: vi.fn(), submit: vi.fn(),
  operation: 'list',
  AccessError: class WrittenAssessmentAccessError extends Error {},
  ValidationError: class WrittenAssessmentValidationError extends Error {},
  ConflictError: class WrittenAssessmentConflictError extends Error {
    constructor(readonly currentRevision?: number, readonly code = 'revision_changed') { super('PRIVATE_CONFLICT_CANARY'); }
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  WrittenAssessmentAccessError: mocks.AccessError,
  WrittenAssessmentValidationError: mocks.ValidationError,
  WrittenAssessmentConflictError: mocks.ConflictError,
  PostgresAdministrationRepository: class { listActiveRoles = mocks.roles; },
  PostgresWrittenAssessmentRepository: class {
    listDrafts = mocks.list; getDraft = mocks.get; saveDraft = mocks.saveDraft; readAuthorDraft = mocks.author;
    publishDraft = mocks.publish; readLearnerAssignment = mocks.learner; saveResponse = mocks.save; submitResponse = mocks.submit;
    constructor(database: unknown, principal: unknown) { mocks.principal(database, principal); }
  },
}));

import { GET as collectionGet, POST as collectionPost } from '@/app/api/assessments/written/route';
import { GET as detailGet } from '@/app/api/assessments/written/[draftId]/route';
import { POST as publicationPost } from '@/app/api/assessments/written/[draftId]/publications/route';
import { GET as learnerGet, POST as learnerPost } from '@/app/api/learner/assignments/[recipientId]/written/route';
import { POST as submissionPost } from '@/app/api/learner/assignments/[recipientId]/written/submissions/route';
import { readWrittenAuthorPage, readWrittenLearnerPage } from './written-assessment-api';

const actorId = '11111111-1111-4111-8111-111111111111';
const otherActorId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-abcd-4333-8333-333333333333';
const foreignClassId = '44444444-4444-4444-8444-444444444444';
const draftId = '55555555-abcd-4555-8555-555555555555';
const publicationId = '66666666-6666-4666-8666-666666666666';
const assignmentId = '77777777-7777-4777-8777-777777777777';
const policyVersionId = '88888888-8888-4888-8888-888888888888';
const recipientId = '99999999-abcd-4999-8999-999999999999';
const attemptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const responseRevisionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const gradeRevisionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const requestKey = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const createdAt = '2026-11-02T12:00:00.000Z';
const updatedAt = '2026-11-02T13:00:00.000Z';
const fingerprint = 'a'.repeat(64);
const criteria = () => [{ id: 'invariant', label: 'Explain the invariant', maxUnits: 125 }, { id: 'complexity', label: 'Analyze complexity', maxUnits: 375 }];
const draftInput = () => ({ classId, title: 'Synthetic pseudocode assignment', instructions: 'Explain your reasoning.',
  prompt: 'Describe how you maintain the synthetic invariant.', criteria: criteria(), availableAt: null, dueAt: null, closesAt: null });
const draft = () => ({ ...draftInput(), id: draftId, revision: 2, status: 'draft', maxUnits: 500, createdBy: actorId, createdAt, updatedAt });
const publication = () => ({ id: publicationId, draftId, draftRevision: 2, classId, assignmentId, policyVersionId,
  recipientCount: 1, audienceKind: 'class', publishedAt: updatedAt });
const author = () => ({ draft: draft(), learners: [{ id: otherActorId, displayName: 'Synthetic enrolled learner', email: null }], rosterFingerprint: fingerprint, publication: null });
const responseDraft = () => ({ revision: 2, text: '  preserve invariant\n    inspect next item\n', updatedAt });
const submission = () => ({ attemptId, responseRevisionId, responseRevision: 2, submittedAt: updatedAt, isLate: false });
const learner = () => ({ recipientId, classId, assignmentId, policyVersionId, title: draftInput().title, instructions: draftInput().instructions,
  prompt: draftInput().prompt, criteria: criteria(), maxUnits: 500, availableAt: null, dueAt: null, closesAt: null,
  responseDraft: responseDraft(), submission: null, releasedGrade: null, isOpen: true, isClosed: false, isExcused: false });
const createCommand = () => ({ draftId: null, expectedRevision: null, requestKey, draft: draftInput() });
const updateCommand = () => ({ draftId, expectedRevision: 1, requestKey, draft: draftInput() });
const publishCommand = () => ({ expectedRevision: 2, expectedRosterFingerprint: fingerprint, audience: { kind: 'class', learnerIds: [otherActorId] }, requestKey });
const saveCommand = () => ({ expectedRevision: 1, text: responseDraft().text, requestKey });
const submitCommand = () => ({ expectedRevision: 2, requestKey });
const draftContext = (id = draftId) => ({ params: Promise.resolve({ draftId: id }) });
const recipientContext = (id = recipientId) => ({ params: Promise.resolve({ recipientId: id }) });

type Operation = 'list' | 'create' | 'update' | 'detail' | 'publish' | 'learner' | 'save' | 'submit';
const operations: Operation[] = ['list', 'create', 'update', 'detail', 'publish', 'learner', 'save', 'submit'];
const mutations: Operation[] = ['create', 'update', 'publish', 'save', 'submit'];
const authorOperations: Operation[] = ['list', 'create', 'update', 'detail', 'publish'];
const learnerOperations: Operation[] = ['learner', 'save', 'submit'];
function request(operation: Operation, options: { query?: string; owner?: string | null; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const method = ['list', 'detail', 'learner'].includes(operation) ? 'GET' : 'POST';
  const path = ['list', 'create', 'update'].includes(operation) ? '/api/assessments/written'
    : operation === 'detail' || operation === 'publish' ? `/api/assessments/written/${draftId}${operation === 'publish' ? '/publications' : ''}`
      : `/api/learner/assignments/${recipientId}/written${operation === 'submit' ? '/submissions' : ''}`;
  const query = options.query ?? (['list', 'detail'].includes(operation) ? `workspace=teach&classId=${classId}` : learnerOperations.includes(operation) ? '' : 'workspace=teach');
  const headers: Record<string, string> = { ...options.headers };
  if (options.owner !== null) headers['x-written-actor'] = options.owner ?? actorId;
  if (method === 'POST') headers['content-type'] = 'application/json';
  const body = options.raw ?? JSON.stringify(Object.hasOwn(options, 'body') ? options.body : operation === 'create' ? createCommand()
    : operation === 'update' ? updateCommand() : operation === 'publish' ? publishCommand() : operation === 'save' ? saveCommand() : submitCommand());
  return new Request(`http://localhost${path}${query ? `?${query}` : ''}`, { method, headers, ...(method === 'POST' ? { body } : {}) });
}
async function run(operation: Operation, req = request(operation), id?: string) {
  mocks.operation = operation;
  if (operation === 'list') return collectionGet(req);
  if (operation === 'create' || operation === 'update') return collectionPost(req);
  if (operation === 'detail') return detailGet(req, draftContext(id));
  if (operation === 'publish') return publicationPost(req, draftContext(id));
  if (operation === 'learner') return learnerGet(req, recipientContext(id));
  if (operation === 'save') return learnerPost(req, recipientContext(id));
  return submissionPost(req, recipientContext(id));
}
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-written-actor');
}
function noWrites() { for (const write of [mocks.saveDraft, mocks.publish, mocks.save, mocks.submit]) expect(write).not.toHaveBeenCalled(); }
function errorDoesNotLeak(body: string) { expect(body).not.toMatch(/PRIVATE_|postgres:\/\/|password|learnerFeedbackCanary/); }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.operation = 'list';
  mocks.session.mockResolvedValue({ user: { id: actorId, role: 'learner', displayName: 'Synthetic actor' } });
  mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  mocks.query.mockImplementation(async () => ({ rows: [{ role: learnerOperations.includes(mocks.operation as Operation) ? 'learner' : 'instructor' }] }));
  mocks.roles.mockResolvedValue(['administrator']);
  mocks.list.mockResolvedValue([draft()]); mocks.get.mockResolvedValue(draft()); mocks.author.mockResolvedValue(author());
  mocks.saveDraft.mockImplementation(async (command: { draftId: string | null }) => command.draftId === null ? { ...draft(), revision: 1 } : draft());
  mocks.publish.mockResolvedValue(publication()); mocks.learner.mockResolvedValue(learner());
  mocks.save.mockResolvedValue({ responseDraft: responseDraft(), currentRevision: 2 }); mocks.submit.mockResolvedValue(submission());
});

describe('written assessment identity, role and concrete scope', () => {
  it.each(operations)('authenticates before malformed input or storage for %s', async operation => {
    mocks.session.mockResolvedValue(null);
    const response = await run(operation, request(operation, { query: 'workspace=invalid', raw: 'PRIVATE_INVALID_BODY' }), 'invalid');
    expect(response.status).toBe(401); privateResponse(response);
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true }); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it.each(operations)('fails closed on session outage for %s', async operation => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_CANARY'));
    const response = await run(operation); expect(response.status).toBe(503); privateResponse(response);
    errorDoesNotLeak(await response.text()); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it.each([null, '', otherActorId, 'invalid'])('requires the exact original HTTP actor (%s)', async owner => {
    for (const operation of operations) {
      const response = await run(operation, request(operation, { owner, query: 'workspace=invalid' }));
      expect(response.status).toBe(409); privateResponse(response); expect(await response.json()).toMatchObject({ error: 'owner_changed' });
    }
    expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it.each(authorOperations)('does not trust mutable session instructor claims for %s', async operation => {
    mocks.session.mockResolvedValue({ user: { id: actorId, role: 'administrator' } }); mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const response = await run(operation); expect(response.status).toBe(403); privateResponse(response); noWrites();
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.author).not.toHaveBeenCalled();
  });

  it.each([[], ['support'], ['content_author'], ['content_reviewer'], ['privacy_operator']].map(roles => ({ roles })))('requires active classes.manage capability: $roles', async ({ roles }) => {
    mocks.roles.mockResolvedValue(roles);
    const response = await run('detail', request('detail', { query: `workspace=admin&classId=${classId}` }));
    expect(response.status).toBe(403); privateResponse(response); expect(mocks.author).not.toHaveBeenCalled(); noWrites();
  });

  it('uses verified instructor identity rather than a client author id', async () => {
    const response = await run('list'); expect(response.status).toBe(200);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { userId: actorId, role: 'instructor' });
    expect(mocks.list).toHaveBeenCalledWith(classId); expect(mocks.close).toHaveBeenCalledOnce(); noWrites();
  });

  it('keeps source class denial opaque for an authorized administrator', async () => {
    mocks.author.mockRejectedValue(new mocks.AccessError('PRIVATE_FOREIGN_CLASS'));
    const response = await run('detail', request('detail', { query: `workspace=admin&classId=${classId}` }));
    expect(response.status).toBe(404); privateResponse(response); errorDoesNotLeak(await response.text());
    expect(mocks.roles).toHaveBeenCalledWith(actorId);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { userId: actorId, role: 'administrator' }); noWrites();
  });

  it.each(learnerOperations)('delegates recipient scope as the current learner for %s', async operation => {
    const response = await run(operation); expect(response.status).toBe(operation === 'submit' ? 201 : 200);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { userId: actorId, role: 'learner' });
  });

  it.each(['saveDraft', 'publish', 'learner', 'save', 'submit'] as const)('does not reveal revoked or foreign access details from %s', async source => {
    mocks[source].mockRejectedValue(new mocks.AccessError('PRIVATE_SCOPE_CANARY'));
    const operation: Operation = source === 'saveDraft' ? 'update' : source;
    const response = await run(operation); expect(response.status).toBe(404); privateResponse(response); errorDoesNotLeak(await response.text());
  });
});

describe('private written drafts, frozen rubric and safe learner projections', () => {
  const canaries = { privateNote: 'PRIVATE_NOTE', requestFingerprint: 'PRIVATE_FINGERPRINT', joinCode: 'PRIVATE_JOIN', rawSession: 'PRIVATE_SESSION' };

  it('returns only class-bound authoring fields in the draft list', async () => {
    mocks.list.mockResolvedValue([{ ...draft(), ...canaries, criteria: criteria().map(item => ({ ...item, privateNote: 'PRIVATE_CRITERION' })) }]);
    const response = await run('list'); expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json(); expect(Object.keys(body).sort()).toEqual(['actorId', 'classId', 'drafts']);
    expect(body.classId).toBe(classId); expect(body.actorId).toBe(actorId); expect(body.drafts[0]).toMatchObject({ id: draftId, revision: 2, prompt: draftInput().prompt });
    errorDoesNotLeak(JSON.stringify(body)); noWrites();
  });

  it('projects the exact saved prompt, ordered criteria and roster without private stored fields', async () => {
    mocks.author.mockResolvedValue({ ...author(), ...canaries, draft: { ...draft(), ...canaries, criteria: criteria().map(item => ({ ...item, hiddenAnswer: 'PRIVATE_KEY' })) },
      learners: [{ ...author().learners[0], ...canaries }], publication: { ...publication(), ...canaries, audienceLearnerIds: [otherActorId] } });
    const response = await run('detail'); expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json(); expect(Object.keys(body).sort()).toEqual(['actorId', 'author']);
    expect(Object.keys(body.author).sort()).toEqual(['draft', 'learners', 'publication', 'rosterFingerprint']);
    expect(body.author.draft.criteria).toEqual(criteria());
    expect(body.author.learners).toEqual(author().learners);
    expect(body.author.publication).toEqual(publication()); errorDoesNotLeak(JSON.stringify(body)); noWrites();
  });

  it('withholds unreturned grade fields and stored notes from the learner', async () => {
    mocks.learner.mockResolvedValue({ ...learner(), ...canaries, grade: { privateNote: 'PRIVATE_UNRELEASED', earnedUnits: 500 },
      criteria: criteria().map(item => ({ ...item, ...canaries })), responseDraft: { ...responseDraft(), ...canaries },
      submission: { ...submission(), ...canaries }, releasedGrade: { gradeRevisionId, earnedUnits: 375, criterionScores: { invariant: 125, complexity: 250 },
        learnerFeedback: 'Explain the loop bound.', publishedAt: updatedAt, ...canaries } });
    const response = await run('learner'); expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json(); expect(Object.keys(body).sort()).toEqual(['actorId', 'assignment']);
    expect(body.assignment.criteria).toEqual(criteria()); expect(body.assignment.responseDraft).toEqual(responseDraft()); expect(body.assignment.submission).toEqual(submission());
    expect(body.assignment.releasedGrade).toEqual({ gradeRevisionId, earnedUnits: 375, criterionScores: { invariant: 125, complexity: 250 }, learnerFeedback: 'Explain the loop bound.', publishedAt: updatedAt });
    errorDoesNotLeak(JSON.stringify(body)); noWrites();
  });

  it('does not invent a grade while a submission awaits instructor review', async () => {
    mocks.learner.mockResolvedValue({ ...learner(), submission: submission() });
    const response = await run('learner'); expect(response.status).toBe(200);
    expect((await response.json()).assignment).toMatchObject({ submission: submission(), releasedGrade: null }); noWrites();
  });

  it('can represent an unopened assignment without exposing its private prompt or rubric', async () => {
    mocks.learner.mockResolvedValue({ ...learner(), isOpen: false, prompt: '', criteria: [], responseDraft: { revision: 0, text: '', updatedAt: null } });
    const response = await run('learner'); expect(response.status).toBe(200);
    expect((await response.json()).assignment).toMatchObject({ isOpen: false, prompt: '', criteria: [], responseDraft: { revision: 0, text: '', updatedAt: null } }); noWrites();
  });

  it('returns an owner-verified metadata-only excusal shell for pending command recovery', async () => {
    mocks.learner.mockResolvedValue({ ...learner(), isExcused: true, prompt: '', criteria: [], responseDraft: { revision: 0, text: '', updatedAt: null } });
    const response = await run('learner'); expect(response.status).toBe(200); privateResponse(response);
    expect((await response.json()).assignment).toMatchObject({ recipientId, policyVersionId, isExcused: true, isOpen: true,
      prompt: '', criteria: [], responseDraft: { revision: 0, text: '', updatedAt: null }, submission: null, releasedGrade: null }); noWrites();
  });

  it.each([{ prompt: draftInput().prompt }, { criteria: criteria() }, { responseDraft: responseDraft() }, { submission: submission() },
    { releasedGrade: { gradeRevisionId, earnedUnits: 0, criterionScores: {}, learnerFeedback: '', publishedAt: updatedAt } }])('refuses private work in an excusal recovery shell (%j)', async changed => {
    mocks.learner.mockResolvedValue({ ...learner(), isExcused: true, prompt: '', criteria: [], responseDraft: { revision: 0, text: '', updatedAt: null }, ...changed });
    const response = await run('learner'); expect(response.status).toBe(503); expect(await response.text()).not.toContain(draftInput().prompt);
  });

  it.each([{ id: draftId, classId: foreignClassId }, { id: publicationId, classId }])('rejects a draft list item outside the requested class or identity (%j)', async item => {
    mocks.list.mockResolvedValue([{ ...draft(), ...item, ...(item.id === publicationId ? { id: 'invalid' } : {}) }]);
    const response = await run('list'); expect(response.status).toBe(503); privateResponse(response); expect(await response.text()).not.toContain(draftInput().prompt);
  });

  it.each([{ id: publicationId }, { classId: foreignClassId }, { maxUnits: 499 }, { revision: 0 }])('rejects inconsistent author data (%j)', async changed => {
    mocks.author.mockResolvedValue({ ...author(), draft: { ...draft(), ...changed } });
    const response = await run('detail'); expect([404, 503]).toContain(response.status); errorDoesNotLeak(await response.text());
  });

  it.each([{ recipientId: publicationId }, { policyVersionId: 'invalid' }, { maxUnits: 499 }, { assignmentId: 'invalid' }, { isExcused: 'false' }])('does not display a mis-scoped or invalid learner snapshot (%j)', async changed => {
    mocks.learner.mockResolvedValue({ ...learner(), ...changed });
    const response = await run('learner'); expect([404, 503]).toContain(response.status); expect(await response.text()).not.toContain(draftInput().prompt);
  });
});

describe('written commands and original accepted receipts', () => {
  it('saves a private draft without publishing or creating learner records', async () => {
    const response = await run('create'); expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json(); expect(body).toMatchObject({ actorId, draft: { id: draftId, revision: 1 }, currentRevision: 2 });
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining(createCommand()));
    expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.get.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.saveDraft.mock.invocationCallOrder[0]);
  });

  it('forwards the exact saved-draft revision and bounded ordered rubric on update', async () => {
    const response = await run('update'); expect(response.status).toBe(200); privateResponse(response);
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining(updateCommand())); expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('returns the original draft acknowledgement while exposing a newer current revision', async () => {
    mocks.get.mockResolvedValue({ ...draft(), revision: 7, title: 'Newer saved content' });
    const response = await run('update'); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ actorId, draft: { revision: 2, title: draftInput().title }, currentRevision: 7 });
    expect(mocks.author).not.toHaveBeenCalled();
  });

  it.each([{ id: publicationId }, { classId: foreignClassId }, { revision: 3 }, { status: 'published' }, { maxUnits: 501 }])('refuses an inconsistent saved-draft receipt (%j)', async changed => {
    mocks.saveDraft.mockResolvedValue({ ...draft(), ...changed });
    const response = await run('update'); expect(response.status).toBe(503); expect(await response.text()).not.toContain(draftInput().prompt);
  });

  it.each([{ id: publicationId }, { classId: foreignClassId }, { revision: 1 }])('does not compare an accepted draft against a wrong or older head (%j)', async changed => {
    mocks.get.mockResolvedValue({ ...draft(), ...changed });
    const response = await run('update'); expect(response.status).toBe(503);
  });

  it('publishes only the explicit expected saved revision and confirmed roster', async () => {
    const response = await run('publish'); expect(response.status).toBe(201); privateResponse(response);
    expect(await response.json()).toEqual({ actorId, publication: publication() });
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ draftId, ...publishCommand() }));
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.author).not.toHaveBeenCalled(); expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('preserves an explicitly selected audience rather than replacing it with the whole class', async () => {
    mocks.publish.mockResolvedValue({ ...publication(), audienceKind: 'selected' });
    const command = { ...publishCommand(), audience: { kind: 'selected', learnerIds: [otherActorId] } };
    const response = await run('publish', request('publish', { body: command })); expect(response.status).toBe(201);
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ audience: command.audience }));
  });

  it.each([{ draftId: publicationId }, { draftRevision: 3 }, { id: 'invalid' }, { policyVersionId: 'invalid' }, { recipientCount: 0 }, { audienceKind: 'selected' }])('refuses an inconsistent publication receipt (%j)', async changed => {
    mocks.publish.mockResolvedValue({ ...publication(), ...changed });
    const response = await run('publish'); expect(response.status).toBe(503); privateResponse(response);
  });

  it('saves exact whitespace and derives recipient identity entirely from the route', async () => {
    const response = await run('save'); expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ actorId, recipientId, responseDraft: responseDraft(), currentRevision: 2 });
    expect(mocks.save).toHaveBeenCalledWith({ recipientId, ...saveCommand() }); expect(mocks.learner).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('allows an explicit empty response draft without treating it as a final submission', async () => {
    mocks.save.mockResolvedValue({ responseDraft: { ...responseDraft(), text: '' }, currentRevision: 2 });
    const response = await run('save', request('save', { body: { ...saveCommand(), text: '' } })); expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ text: '' })); expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('returns an old accepted save after newer server edits without pretending it is latest', async () => {
    mocks.save.mockResolvedValue({ responseDraft: responseDraft(), currentRevision: 9 });
    const response = await run('save'); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ responseDraft: { revision: 2, text: responseDraft().text }, currentRevision: 9 });
    expect(mocks.learner).not.toHaveBeenCalled();
  });

  it.each([{ responseDraft: { ...responseDraft(), revision: 1 }, currentRevision: 2 }, { responseDraft: responseDraft(), currentRevision: 1 },
    { responseDraft: { ...responseDraft(), text: 'A different response' }, currentRevision: 2 }])('refuses an inconsistent response-save receipt (%j)', async accepted => {
    mocks.save.mockResolvedValue(accepted);
    const response = await run('save'); expect(response.status).toBe(503); privateResponse(response);
  });

  it('submits only a saved revision and returns an original immutable submission receipt', async () => {
    const response = await run('submit'); expect(response.status).toBe(201); privateResponse(response);
    expect(await response.json()).toEqual({ actorId, recipientId, submission: submission() });
    expect(mocks.submit).toHaveBeenCalledWith({ recipientId, ...submitCommand() });
    expect(mocks.learner).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([{ responseRevision: 3 }, { attemptId: 'invalid' }, { responseRevisionId: 'invalid' }, { isLate: 'false' }])('refuses a malformed submission receipt (%j)', async changed => {
    mocks.submit.mockResolvedValue({ ...submission(), ...changed });
    const response = await run('submit'); expect(response.status).toBe(503); privateResponse(response);
  });

  it.each(['save', 'submit'] as const)('does not shadow an accepted %s retry with a fresh eligibility read', async operation => {
    mocks.learner.mockRejectedValue(new mocks.AccessError('PRIVATE_NOW_EXCUSED_OR_CLOSED'));
    const response = await run(operation); expect(response.status).toBe(operation === 'submit' ? 201 : 200);
    expect(mocks.learner).not.toHaveBeenCalled();
  });

  it.each(['update', 'publish', 'save', 'submit'] as const)('reports a safe stale-command conflict for %s', async operation => {
    (operation === 'update' ? mocks.saveDraft : operation === 'publish' ? mocks.publish : mocks[operation]).mockRejectedValue(new mocks.ConflictError(6, 'revision_changed'));
    const response = await run(operation); expect(response.status).toBe(409); privateResponse(response);
    const body = await response.json(); expect(body.currentRevision).toBe(6); errorDoesNotLeak(JSON.stringify(body));
  });
});

describe('strict written request decoding and bounded input', () => {
  it.each(['', `workspace=teach&workspace=admin&classId=${classId}`, `workspace=teach&classId=${classId}&classId=${foreignClassId}`,
    `workspace=learner&classId=${classId}`, 'workspace=teach&classId=invalid', `workspace=teach&classId=${classId}&ownerId=${otherActorId}`])('rejects ambiguous list scope before opening storage: %s', async query => {
    const response = await run('list', request('list', { query })); expect(response.status).toBe(400); privateResponse(response); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });

  it.each(['create', 'update', 'publish'] as const)('does not accept read-only query fields for %s', async operation => {
    const response = await run(operation, request(operation, { query: `workspace=teach&classId=${classId}` })); expect(response.status).toBe(400); noWrites();
  });

  it.each(learnerOperations)('rejects identity/policy/workspace overrides in learner query for %s', async operation => {
    const response = await run(operation, request(operation, { query: `workspace=admin&learnerId=${otherActorId}` })); expect(response.status).toBe(400); noWrites();
  });

  it.each(['detail', 'publish', 'learner', 'save', 'submit'] as const)('rejects an invalid route identity for %s', async operation => {
    const response = await run(operation, request(operation), 'invalid'); expect(response.status).toBe(400); noWrites();
  });

  const invalidDrafts = [
    { ...draftInput(), title: 'x' }, { ...draftInput(), title: 'x'.repeat(161) }, { ...draftInput(), instructions: 'x'.repeat(2001) },
    { ...draftInput(), prompt: ' ' }, { ...draftInput(), prompt: 'x'.repeat(20001) }, { ...draftInput(), classId: 'invalid' },
    { ...draftInput(), criteria: [] }, { ...draftInput(), criteria: Array.from({ length: 21 }, (_, i) => ({ id: `criterion-${i}`, label: 'Item', maxUnits: 1 })) },
    { ...draftInput(), criteria: [criteria()[0], criteria()[0]] }, { ...draftInput(), criteria: [{ ...criteria()[0], id: '__proto__' }] },
    { ...draftInput(), criteria: [{ ...criteria()[0], id: 'constructor' }] }, { ...draftInput(), criteria: [{ ...criteria()[0], id: 'prototype' }] },
    { ...draftInput(), criteria: [{ ...criteria()[0], label: '' }] }, { ...draftInput(), criteria: [{ ...criteria()[0], maxUnits: 0 }] },
    { ...draftInput(), criteria: [{ ...criteria()[0], maxUnits: 1.25 }] }, { ...draftInput(), criteria: [{ ...criteria()[0], maxUnits: '125' }] },
    { ...draftInput(), criteria: criteria().map(item => ({ ...item, maxUnits: 600000 })) },
    { ...draftInput(), criteria: [{ ...criteria()[0], privateNote: 'PRIVATE_NOTE' }] }, { ...draftInput(), audience: [otherActorId] },
    { ...draftInput(), availableAt: '2026-11-31T12:00:00.000Z' }, { ...draftInput(), dueAt: '2026-11-02' },
    { ...draftInput(), availableAt: '0000-01-01T00:00:00.000Z' },
    { ...draftInput(), availableAt: '2026-11-03T12:00:00.000Z', dueAt: '2026-11-02T12:00:00.000Z' },
    ...['\u0000', '\ud800', '\udc00'].flatMap(invalid => [
      { ...draftInput(), prompt: `Synthetic ${invalid} prompt` },
      { ...draftInput(), criteria: [{ ...criteria()[0], label: `Synthetic ${invalid} criterion` }] },
    ]),
  ];
  it.each(invalidDrafts)('rejects an invalid authored draft before mutation (%j)', async input => {
    const response = await run('update', request('update', { body: { ...updateCommand(), draft: input } }));
    expect(response.status).toBe(400); privateResponse(response); noWrites();
  });

  const invalidCommands: [Operation, unknown][] = [
    ['create', { ...createCommand(), expectedRevision: 1 }], ['create', { ...createCommand(), ownerId: otherActorId }],
    ['update', { ...updateCommand(), expectedRevision: null }], ['update', { ...updateCommand(), expectedRevision: 0 }],
    ['update', { ...updateCommand(), expectedRevision: 2147483648 }], ['update', { ...updateCommand(), requestKey: '' }],
    ['update', { ...updateCommand(), requestKey: 'x'.repeat(129) }], ['update', { ...updateCommand(), draftId: 'invalid' }],
    ['publish', { ...publishCommand(), expectedRevision: 0 }], ['publish', { ...publishCommand(), expectedRosterFingerprint: 'invalid' }],
    ['publish', { ...publishCommand(), audience: { kind: 'class', learnerIds: [] } }],
    ['publish', { ...publishCommand(), audience: { kind: 'selected', learnerIds: [otherActorId, otherActorId] } }],
    ['publish', { ...publishCommand(), audience: { kind: 'selected', learnerIds: ['invalid'] } }],
    ['publish', { ...publishCommand(), audience: { kind: ['class'], learnerIds: [otherActorId] } }],
    ['publish', { ...publishCommand(), audience: { kind: { value: 'class' }, learnerIds: [otherActorId] } }],
    ['publish', { ...publishCommand(), snapshot: draftInput() }], ['publish', { ...publishCommand(), policyVersionId }],
    ['save', { ...saveCommand(), expectedRevision: -1 }], ['save', { ...saveCommand(), expectedRevision: 1.5 }],
    ['save', { ...saveCommand(), learnerId: otherActorId }], ['save', { ...saveCommand(), policyVersionId }],
    ['save', { ...saveCommand(), criterionScores: { invariant: 125 } }], ['save', { ...saveCommand(), language: 'python' }],
    ['save', { ...saveCommand(), text: 'é'.repeat(50001) }], ['submit', { ...submitCommand(), expectedRevision: 0 }],
    ...['\u0000', '\ud800', '\udc00'].map(invalid => ['save', { ...saveCommand(), text: `Preserve ${invalid} exactly` }] as [Operation, unknown]),
    ['submit', { ...submitCommand(), text: 'Unacknowledged response' }], ['submit', { ...submitCommand(), gradeRevisionId }],
  ];
  it.each(invalidCommands)('rejects unauthorized or invalid %s command fields (%j)', async (operation, body) => {
    const response = await run(operation, request(operation, { body })); expect(response.status).toBe(400); privateResponse(response); noWrites();
  });

  it.each(mutations)('rejects malformed and duplicate-key JSON for %s', async operation => {
    for (const raw of ['{', 'PRIVATE_INVALID_JSON', '{"requestKey":"one","requestKey":"two"}', '{"nested":{"a":1,"a":2}}']) {
      const response = await run(operation, request(operation, { raw })); expect(response.status).toBe(400); privateResponse(response); errorDoesNotLeak(await response.text());
    }
    noWrites();
  });

  it.each(mutations)('caps the actual request stream independently of Content-Length for %s', async operation => {
    const response = await run(operation, request(operation, { raw: ' '.repeat(650001) }));
    expect(response.status).toBe(413); privateResponse(response); noWrites();
  });

  it('rejects a declared oversized body before reading the stream', async () => {
    const response = await run('save', request('save', { headers: { 'content-length': '650001' } })); expect(response.status).toBe(413); noWrites();
  });

  it.each(['\n', '\u0001', 'é', '🙂'])('accepts the exact UTF-8 text boundary despite JSON escaping (%j)', async character => {
    const text = character.repeat(100000 / new TextEncoder().encode(character).byteLength);
    expect(new TextEncoder().encode(text).byteLength).toBe(100000);
    mocks.save.mockResolvedValue({ responseDraft: { ...responseDraft(), text }, currentRevision: 2 });
    const response = await run('save', request('save', { body: { ...saveCommand(), text } }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith({ recipientId, ...saveCommand(), text });
    expect((await response.json()).responseDraft.text).toBe(text);
  });

  it('canonicalizes class/draft/recipient identities without changing the response or request key', async () => {
    const detail = await run('detail', request('detail', { query: `workspace=teach&classId=${classId.toUpperCase()}` }), draftId.toUpperCase());
    expect(detail.status).toBe(200); expect(mocks.author).toHaveBeenCalledWith(draftId);
    const saved = await run('save', request('save'), recipientId.toUpperCase()); expect(saved.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith({ recipientId, ...saveCommand() });
  });

  it.each(['list', 'author', 'saveDraft', 'get', 'publish', 'learner', 'save', 'submit', 'query', 'close'] as const)('sanitizes a %s storage failure', async source => {
    mocks[source].mockRejectedValue(new Error('PRIVATE_DATABASE_CANARY postgres://password'));
    const operation: Operation = source === 'author' ? 'detail' : source === 'saveDraft' || source === 'get' ? 'update' : source === 'query' || source === 'close' ? 'list' : source;
    const response = await run(operation); expect(response.status).toBe(503); privateResponse(response); errorDoesNotLeak(await response.text());
  });

  it.each(['saveDraft', 'publish', 'save', 'submit'] as const)('sanitizes repository validation for %s', async source => {
    mocks[source].mockRejectedValue(new mocks.ValidationError('PRIVATE_VALIDATION_CANARY'));
    const response = await run(source === 'saveDraft' ? 'update' : source); expect(response.status).toBe(400); errorDoesNotLeak(await response.text());
  });
});

describe('written server-page entry points', () => {
  it('authorizes a server-rendered class list without requiring a browser actor header', async () => {
    const access = await readWrittenAuthorPage('teach', classId);
    expect(access).toMatchObject({ status: 'authorized', data: { actorId, classId, drafts: [draft()] } }); noWrites();
  });

  it('authorizes a server-rendered class-bound detail without adding assignment side effects', async () => {
    const access = await readWrittenAuthorPage('teach', classId, draftId);
    expect(access).toMatchObject({ status: 'authorized', data: { actorId, author: author() } }); noWrites();
  });

  it('checks learner identity and returns only its assignment view', async () => {
    mocks.operation = 'learner';
    expect(await readWrittenLearnerPage(recipientId)).toMatchObject({ status: 'authorized', data: { actorId, assignment: learner() } }); noWrites();
  });

  it('distinguishes absent identity from missing author permission', async () => {
    mocks.session.mockResolvedValue(null); expect(await readWrittenAuthorPage('teach', classId)).toEqual({ status: 'unauthenticated' });
    expect(await readWrittenLearnerPage(recipientId)).toEqual({ status: 'unauthenticated' });
    mocks.session.mockResolvedValue({ user: { id: actorId } }); mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    expect(await readWrittenAuthorPage('teach', classId)).toEqual({ status: 'forbidden' }); noWrites();
  });

  it('does not turn an Auth outage into an empty or cached page', async () => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_OUTAGE'));
    await expect(readWrittenAuthorPage('teach', classId)).rejects.toThrow();
    await expect(readWrittenLearnerPage(recipientId)).rejects.toThrow(); expect(mocks.database).not.toHaveBeenCalled(); noWrites();
  });
});

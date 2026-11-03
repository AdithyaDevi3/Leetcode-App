import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn(), roles: vi.fn(), principal: vi.fn(), gradebookPrincipal: vi.fn(),
  preview: vi.fn(), detail: vi.fn(), release: vi.fn(), share: vi.fn(), revoke: vi.fn(), shared: vi.fn(), sharedDetail: vi.fn(), history: vi.fn(), append: vi.fn(),
  AccessError: class GradebookAccessError extends Error {}, ConflictError: class GradebookConflictError extends Error {},
  ValidationError: class GradeReleaseValidationError extends Error {},
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  GradebookAccessError: mocks.AccessError, GradebookConflictError: mocks.ConflictError, GradeReleaseValidationError: mocks.ValidationError,
  PostgresAdministrationRepository: class { listActiveRoles = mocks.roles; },
  PostgresGradebookRepository: class {
    constructor(db: unknown, principal: unknown) { mocks.gradebookPrincipal(db, principal); }
    readRecipient = mocks.history; appendGrade = mocks.append;
  },
  PostgresClassGradeReleaseRepository: class {
    constructor(db: unknown, principal: unknown) { mocks.principal(db, principal); }
    readAssignment = mocks.preview; readResponseDetail = mocks.detail; publishAssignmentGrades = mocks.release;
    publishClassResults = mocks.share; revokeClassResults = mocks.revoke; readSharedAssignment = mocks.shared; readSharedResponseDetail = mocks.sharedDetail;
  },
}));

import { GET as previewGet } from '@/app/api/class-gradebook/[classId]/assignments/[assignmentId]/route';
import { GET as detailGet } from '@/app/api/class-gradebook/[classId]/recipients/[recipientId]/route';
import { POST as draftPost } from '@/app/api/class-gradebook/[classId]/recipients/[recipientId]/draft-grade/route';
import { POST as releasePost } from '@/app/api/class-gradebook/[classId]/assignments/[assignmentId]/releases/route';
import { POST as sharingPost } from '@/app/api/class-gradebook/[classId]/assignments/[assignmentId]/sharing/route';
import { GET as sharedGet } from '@/app/api/class-gradebook/[classId]/assignments/[assignmentId]/shared-results/route';
import { GET as sharedDetailGet } from '@/app/api/class-gradebook/[classId]/assignments/[assignmentId]/shared-results/[recipientId]/route';
import { readClassGradebookData, readLearnerClassResultsData } from './class-gradebook-access';

const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-abcd-4222-8222-222222222222';
const assignmentId = '33333333-abcd-4333-8333-333333333333';
const recipientId = '44444444-abcd-4444-8444-444444444444';
const learnerId = '55555555-5555-4555-8555-555555555555';
const gradeRevisionId = '66666666-6666-4666-8666-666666666666';
const publicationId = '77777777-7777-4777-8777-777777777777';
const policyVersionId = '88888888-8888-4888-8888-888888888888';
const attemptId = '99999999-9999-4999-8999-999999999999';
const receiptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const date = '2026-11-02T16:00:00.000Z';
const assignment = () => ({ id: assignmentId, title: 'Synthetic class quiz', kind: 'quiz', instructions: 'Choose an option.', dueOn: null, closesAt: null, maxUnits: 1000, policyVersionId });
const content = () => ({ prompt: 'Synthetic assignment prompt', questions: [{ id: 'synthetic-question@1', title: 'Synthetic question', prompt: 'Choose the synthetic invariant.', options: [{ id: 'a', text: 'A synthetic answer' }, { id: 'b', text: 'Another synthetic answer' }], maxUnits: 1000 }] });
const response = () => ({ attemptId, sequence: 1, submittedAt: date, text: null, language: null, answers: { 'synthetic-question@1': 'a' } });
const target = () => ({ recipientId, gradeRevisionId, expectedPublicationSequence: 0 });
const shareTarget = () => ({ recipientId, gradeRevisionId, publicationId, attemptId });
const releaseCommand = () => ({ targets: [target()], requestKey: 'reviewed-release-1' });
const draftCommand = () => ({ attemptId, expectedGradeRevisionId: null, criterionScores: { reasoning: 800 }, learnerFeedback: 'Synthetic reviewed feedback.', privateNote: 'Synthetic staff note.', requestKey: 'reviewed-draft-1' });
const history = () => ({ assignment: { classId, id: assignmentId }, policy: { maxUnits: 1000, scoring: { mode: 'reviewed_rubric', criteria: [{ id: 'reasoning', label: 'Reasoning', maxUnits: 1000 }] } } });
const draftGrade = () => ({ id: gradeRevisionId, sequence: 1, kind: 'scored', earnedUnits: 800, attemptId,
  criterionScores: draftCommand().criterionScores, learnerFeedback: draftCommand().learnerFeedback, privateNote: draftCommand().privateNote, createdAt: date });
const sharingCommand = () => ({ action: 'publish', targets: [shareTarget()], expectedSharingSequence: 0, requestKey: 'reviewed-share-1' });
const sharingReceipt = () => ({ id: receiptId, sequence: 1, classId, assignmentId, shared: true, recipientCount: 1, createdAt: date });
const preview = () => ({ classroom: { id: classId, name: 'Synthetic class' }, assignment: assignment(), archived: false, content: content(), sharing: null,
  roster: [{ learner: { id: learnerId, displayName: 'Synthetic learner', email: 'learner@example.test' }, membership: 'included', recipientId, state: 'draft',
    earnedUnits: 800, maxUnits: 1000, ready: true, reason: null, releaseTarget: target(), shareTarget: null, response: response() }] });
const detail = () => ({ classroom: { id: classId, name: 'Synthetic class' }, assignment: assignment(), content: content(),
  learner: { id: learnerId, displayName: 'Synthetic learner', email: 'learner@example.test' }, recipientId, response: response(), state: 'draft',
  grade: { id: gradeRevisionId, earnedUnits: 800, maxUnits: 1000, criterionScores: {}, learnerFeedback: 'Synthetic private learner feedback.', published: false, publicationSequence: 0 }, releaseTarget: target() });
const releaseReceipt = () => ({ id: receiptId, classId, assignmentId, actorId, createdAt: date,
  publications: [{ recipientId, publication: { id: publicationId, sequence: 1, gradeRevisionId, publishedAt: date } }] });
const shared = () => ({ classroom: { id: classId, name: 'Synthetic class' }, assignment: assignment(), content: content(), sharing: sharingReceipt(),
  learners: [{ learner: { id: learnerId, displayName: 'Synthetic learner' }, recipientId, earnedUnits: 800, maxUnits: 1000, response: response() }] });
const sharedDetail = () => ({ classroom: { id: classId, name: 'Synthetic class' }, assignment: assignment(), content: content(), learner: { id: learnerId, displayName: 'Synthetic learner' }, recipientId, response: response(), earnedUnits: 800, maxUnits: 1000, sharing: sharingReceipt() });
type Operation = 'preview' | 'detail' | 'draft' | 'release' | 'share' | 'revoke' | 'shared' | 'sharedDetail';
const operations: Operation[] = ['preview', 'detail', 'draft', 'release', 'share', 'revoke', 'shared', 'sharedDetail'];
const mutations: Operation[] = ['draft', 'release', 'share', 'revoke'];
const learnerOperation = (operation: Operation) => operation === 'shared' || operation === 'sharedDetail';

function request(operation: Operation, options: { owner?: string | null; workspace?: string; query?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const method = mutations.includes(operation) ? 'POST' : 'GET';
  const path = operation === 'detail' || operation === 'draft' ? `/api/class-gradebook/${classId}/recipients/${recipientId}${operation === 'draft' ? '/draft-grade' : ''}`
    : `/api/class-gradebook/${classId}/assignments/${assignmentId}${operation === 'release' ? '/releases' : operation === 'share' || operation === 'revoke' ? '/sharing'
      : learnerOperation(operation) ? `/shared-results${operation === 'sharedDetail' ? `/${recipientId}` : ''}` : ''}`;
  const query = options.query ?? (learnerOperation(operation) ? '' : `workspace=${options.workspace ?? 'teach'}`);
  const headers: Record<string, string> = { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...options.headers };
  if (options.owner !== null) headers['x-assessment-author'] = options.owner ?? actorId;
  return new Request(`http://local${path}${query ? `?${query}` : ''}`, { method, headers, ...(method === 'POST' ? { body: options.raw ?? JSON.stringify(Object.hasOwn(options, 'body') ? options.body
    : operation === 'draft' ? draftCommand() : operation === 'release' ? releaseCommand() : operation === 'share' ? sharingCommand() : { action: 'revoke', expectedSharingSequence: 0, requestKey: 'reviewed-revoke-1' }) } : {}) });
}
async function run(operation: Operation, req = request(operation), ids: { classId?: string; assignmentId?: string; recipientId?: string } = {}) {
  const params = Promise.resolve({ classId: ids.classId ?? classId, assignmentId: ids.assignmentId ?? assignmentId, recipientId: ids.recipientId ?? recipientId });
  if (operation === 'preview') return previewGet(req, { params });
  if (operation === 'detail') return detailGet(req, { params });
  if (operation === 'draft') return draftPost(req, { params });
  if (operation === 'release') return releasePost(req, { params });
  if (operation === 'share' || operation === 'revoke') return sharingPost(req, { params });
  if (operation === 'shared') return sharedGet(req, { params });
  return sharedDetailGet(req, { params });
}
function privateResponse(result: Response) {
  expect(result.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(result.headers.get('vary')).toBe('Cookie, x-assessment-author');
}
function noWrites() { for (const method of [mocks.append, mocks.release, mocks.share, mocks.revoke]) expect(method).not.toHaveBeenCalled(); }
const operationMethod = (operation: Operation) => operation === 'draft' ? mocks.append : operation === 'preview' ? mocks.preview : operation === 'detail' ? mocks.detail
  : operation === 'release' ? mocks.release : operation === 'share' ? mocks.share : operation === 'revoke' ? mocks.revoke : operation === 'shared' ? mocks.shared : mocks.sharedDetail;
function noLeak(text: string) { expect(text).not.toMatch(/PRIVATE_|postgres:\/\/|password|correctOptionId|privateNote/); }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: actorId } });
  mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] });
  mocks.roles.mockResolvedValue(['administrator']);
  mocks.preview.mockResolvedValue(preview()); mocks.detail.mockResolvedValue(detail()); mocks.release.mockResolvedValue(releaseReceipt());
  mocks.share.mockResolvedValue(sharingReceipt()); mocks.revoke.mockResolvedValue({ ...sharingReceipt(), shared: false, recipientCount: 0 });
  mocks.shared.mockResolvedValue(shared()); mocks.sharedDetail.mockResolvedValue(sharedDetail());
  mocks.history.mockResolvedValue(history()); mocks.append.mockResolvedValue(draftGrade());
});

describe('class gradebook auth and API boundaries', () => {
  it.each(operations)('denies anonymous %s requests without opening a database', async operation => {
    mocks.session.mockResolvedValue(null); const result = await run(operation);
    expect(result.status).toBe(401); privateResponse(result); noWrites(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each(operations)('fails closed on an authentication outage for %s', async operation => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_AUTH_OUTAGE')); const result = await run(operation);
    expect(result.status).toBe(503); privateResponse(result); noLeak(await result.text()); noWrites(); expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each(mutations)('binds %s commands to the current account before reading the body', async operation => {
    for (const owner of [null, learnerId]) {
      const result = await run(operation, request(operation, { owner, raw: 'PRIVATE_MALFORMED_BODY' }));
      expect(result.status).toBe(409); privateResponse(result); expect(await result.json()).toMatchObject({ error: 'owner_changed', code: 'owner_changed' });
    }
    noWrites();
  });
  it.each(operations)('rejects a stale account header on %s reads and writes', async operation => {
    if (learnerOperation(operation)) mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run(operation, request(operation, { owner: learnerId }));
    expect(result.status).toBe(409); noWrites();
  });
  it.each(['preview', 'detail'] as const)('authorizes teacher %s reads with an explicit instructor principal', async operation => {
    const result = await run(operation); expect(result.status).toBe(200); privateResponse(result);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'instructor', userId: actorId }); noWrites();
  });
  it('authorizes an admin through active management roles rather than its user metadata', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run('preview', request('preview', { workspace: 'admin' }));
    expect(result.status).toBe(200); expect(mocks.roles).toHaveBeenCalledWith(actorId);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'administrator', userId: actorId }); noWrites();
  });
  it.each(['preview', 'detail', 'draft', 'release', 'share', 'revoke'] as const)('denies revoked administrative roles for %s', async operation => {
    mocks.roles.mockResolvedValue([]); const result = await run(operation, request(operation, { workspace: 'admin' }));
    expect(result.status).toBe(403); privateResponse(result); expect(mocks.principal).not.toHaveBeenCalled(); noWrites();
  });
  it.each(['preview', 'detail', 'draft', 'release', 'share', 'revoke'] as const)('denies learners selecting the teaching workspace for %s', async operation => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] }); const result = await run(operation);
    expect(result.status).toBe(403); privateResponse(result); noWrites();
  });
  it.each(['shared', 'sharedDetail'] as const)('uses only a current learner principal for %s', async operation => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] }); const result = await run(operation);
    expect(result.status).toBe(200); privateResponse(result);
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'learner', userId: actorId });
    expect(mocks.roles).not.toHaveBeenCalled(); noWrites();
  });
  it.each(operations)('maps inaccessible/wrong-class %s records to private 404 responses', async operation => {
    if (learnerOperation(operation)) mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    operationMethod(operation).mockRejectedValue(new mocks.AccessError('PRIVATE_CLASS_RECORD'));
    const result = await run(operation); expect(result.status).toBe(404); privateResponse(result); noLeak(await result.text());
  });
  it('retains the exact release command and validates original receipts on retry', async () => {
    const first = await run('release'), retry = await run('release');
    expect(first.status).toBe(201); expect(retry.status).toBe(201); privateResponse(first);
    expect(await first.json()).toEqual(await retry.json());
    expect(mocks.release.mock.calls[1]).toEqual(mocks.release.mock.calls[0]);
    expect(mocks.release).toHaveBeenCalledWith({ classId, assignmentId, ...releaseCommand(), reason: expect.any(String) });
    expect(mocks.share).not.toHaveBeenCalled();
  });
  it('publishes reviewed class targets independently of private grade releases', async () => {
    const result = await run('share'); expect(result.status).toBe(201); privateResponse(result);
    expect(mocks.share).toHaveBeenCalledWith({ classId, assignmentId, targets: [shareTarget()], expectedSharingSequence: 0,
      requestKey: sharingCommand().requestKey, reason: expect.any(String) }); expect(mocks.release).not.toHaveBeenCalled();
  });
  it('revokes sharing without accepting or releasing another learner selection', async () => {
    const result = await run('revoke'); expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ actorId, receipt: { shared: false, recipientCount: 0 } });
    expect(mocks.revoke).toHaveBeenCalledWith({ classId, assignmentId, expectedSharingSequence: 0, requestKey: 'reviewed-revoke-1', reason: expect.any(String) });
    expect(mocks.share).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it.each(mutations)('returns a sanitized conflict when %s reviewed targets are stale', async operation => {
    operationMethod(operation).mockRejectedValue(new mocks.ConflictError('PRIVATE_CONFLICT'));
    const result = await run(operation); expect(result.status).toBe(409); privateResponse(result); noLeak(await result.text());
  });
  it.each(mutations)('sanitizes repository %s validation', async operation => {
    operationMethod(operation).mockRejectedValue(new mocks.ValidationError('PRIVATE_VALIDATION'));
    const result = await run(operation); expect(result.status).toBe(400); privateResponse(result); noLeak(await result.text());
  });
  it.each(['query', 'close', 'preview', 'detail', 'history', 'append', 'release', 'share', 'revoke', 'shared', 'sharedDetail'] as const)('sanitizes a %s database failure', async method => {
    mocks[method].mockRejectedValue(new Error('PRIVATE_DATABASE postgres://password'));
    const operation: Operation = method === 'query' || method === 'close' ? 'preview' : method === 'history' || method === 'append' ? 'draft' : method;
    if (learnerOperation(operation)) mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run(operation); expect(result.status).toBe(503); privateResponse(result); noLeak(await result.text());
  });
  it.each(mutations)('rejects duplicate-key, malformed and oversized %s bodies without a write', async operation => {
    for (const raw of ['{', '{"requestKey":"first","requestKey":"second"}', '{"targets":[],"targets":[]}']) {
      const result = await run(operation, request(operation, { raw })); expect(result.status).toBe(400); privateResponse(result);
    }
    const oversized = await run(operation, request(operation, { raw: ' '.repeat(160001) }));
    expect(oversized.status).toBe(413); privateResponse(oversized); noWrites();
  });
  it('rejects an oversized declared stream before reading its body', async () => {
    const result = await run('release', request('release', { headers: { 'content-length': '160001' } }));
    expect(result.status).toBe(413); noWrites();
  });
  it('rejects non-JSON mutation content types', async () => {
    const result = await run('release', request('release', { headers: { 'content-type': 'text/plain' } }));
    expect(result.status).toBe(400); noWrites();
  });
  it.each(operations)('rejects malformed class identities for %s', async operation => {
    if (learnerOperation(operation)) mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run(operation, request(operation), { classId: 'invalid' }); expect(result.status).toBe(400); noWrites();
  });
  it('canonicalizes path identities without changing the reviewed request identity', async () => {
    const result = await run('release', request('release'), { classId: classId.toUpperCase(), assignmentId: assignmentId.toUpperCase() });
    expect(result.status).toBe(201); expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ classId, assignmentId, requestKey: releaseCommand().requestKey }));
  });
  it('lets a verified admin save a rubric draft for another class owner without publishing it', async () => {
    const result = await run('draft', request('draft', { workspace: 'admin' })); expect(result.status).toBe(201); privateResponse(result);
    expect(await result.json()).toEqual({ actorId, grade: draftGrade() });
    expect(mocks.gradebookPrincipal).toHaveBeenCalledWith(expect.anything(), { role: 'administrator', userId: actorId });
    expect(mocks.append).toHaveBeenCalledWith({ ...draftCommand(), recipientId, expectedClassId: classId, kind: 'scored', reason: expect.any(String) });
    expect(mocks.release).not.toHaveBeenCalled(); expect(mocks.share).not.toHaveBeenCalled();
  });
  it('denies a recipient outside the class-scoped draft endpoint before writing', async () => {
    mocks.history.mockResolvedValue({ ...history(), assignment: { ...history().assignment, classId: learnerId } });
    const result = await run('draft'); expect(result.status).toBe(404); noWrites();
  });
  it('does not allow rubric grading to replace deterministic quiz scoring', async () => {
    mocks.history.mockResolvedValue({ ...history(), policy: { ...history().policy, scoring: { mode: 'multiple_choice' } } });
    const result = await run('draft'); expect(result.status).toBe(400); noWrites();
  });
  it.each([{ reasoning: 1001 }, { extra: 800 }, { reasoning: 800, extra: 0 }])('scores every published criterion and stays within its frozen maximum (%j)', async criterionScores => {
    const result = await run('draft', request('draft', { body: { ...draftCommand(), criterionScores } })); expect(result.status).toBe(400); noWrites();
  });
  it('preserves a retried manual draft command and checks the exact accepted grade response', async () => {
    const first = await run('draft'), retry = await run('draft'); expect(first.status).toBe(201); expect(retry.status).toBe(201);
    expect(mocks.append.mock.calls[1]).toEqual(mocks.append.mock.calls[0]); expect(await first.json()).toEqual(await retry.json());
    mocks.append.mockResolvedValue({ ...draftGrade(), earnedUnits: 700 }); const malformed = await run('draft'); expect(malformed.status).toBe(503);
  });
});

describe('class gradebook safe response projections', () => {
  it('omits future private fields and response text from the full roster preview', async () => {
    const source = preview();
    mocks.preview.mockResolvedValue({ ...source, privateNote: 'PRIVATE_PREVIEW', content: { ...source.content, correctOptionId: 'PRIVATE_KEY' },
      roster: [{ ...source.roster[0], privateNote: 'PRIVATE_ROSTER', response: { ...response(), text: 'PRIVATE_LARGE_RESPONSE' } }] });
    const result = await run('preview'); expect(result.status).toBe(200); const body = await result.json();
    expect(body.preview.roster[0].response).toMatchObject({ attemptId, text: null, language: null, answers: {} });
    noLeak(JSON.stringify(body));
  });
  it('keeps student feedback and notes out of class-shared roster and question DTOs', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] }); const source = shared();
    mocks.shared.mockResolvedValue({ ...source, learnerFeedback: 'PRIVATE_FEEDBACK', privateNote: 'PRIVATE_NOTE',
      content: { ...source.content, questions: [{ ...source.content.questions[0], correctOptionId: 'PRIVATE_KEY', explanation: 'PRIVATE_EXPLANATION' }] },
      learners: [{ ...source.learners[0], learnerFeedback: 'PRIVATE_FEEDBACK', learner: { ...source.learners[0].learner, email: 'PRIVATE_EMAIL' } }] });
    const result = await run('shared'); expect(result.status).toBe(200); const body = await result.json();
    expect(body.results.learners[0].response.answers).toEqual({}); expect(body.results.learners[0].learner).toEqual({ id: learnerId, displayName: 'Synthetic learner' });
    noLeak(JSON.stringify(body));
  });
  it('loads pinned shared answers only through the currently authorized detail projection', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    mocks.sharedDetail.mockResolvedValue({ ...sharedDetail(), privateNote: 'PRIVATE_NOTE', learnerFeedback: 'PRIVATE_FEEDBACK',
      learner: { ...sharedDetail().learner, email: 'PRIVATE_EMAIL' } });
    const result = await run('sharedDetail'); expect(result.status).toBe(200); const body = await result.json();
    expect(body.detail.response.answers).toEqual(response().answers); noLeak(JSON.stringify(body));
    expect(mocks.sharedDetail).toHaveBeenCalledWith(classId, assignmentId, recipientId);
  });
  it('returns the exact sharing version used for a pinned response and denies revoked detail records', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await run('sharedDetail'); expect(result.status).toBe(200);
    expect((await result.json()).detail.sharing).toEqual(sharingReceipt());
    mocks.sharedDetail.mockResolvedValue({ ...sharedDetail(), sharing: { ...sharingReceipt(), shared: false, recipientCount: 0 } });
    const revoked = await run('sharedDetail'); expect(revoked.status).toBe(503); noLeak(await revoked.text());
  });
  it('omits privileged review-only fields when opening a question/answer detail', async () => {
    mocks.detail.mockResolvedValue({ ...detail(), privateNote: 'PRIVATE_NOTE', rawScoreEvidence: 'PRIVATE_EVIDENCE',
      grade: { ...detail().grade, privateNote: 'PRIVATE_NOTE' } });
    const result = await run('detail'); expect(result.status).toBe(200); const body = await result.json();
    expect(body.detail.grade.learnerFeedback).toBe(detail().grade.learnerFeedback); noLeak(JSON.stringify(body));
  });
  it('fails closed if storage returns another class in an otherwise valid preview', async () => {
    mocks.preview.mockResolvedValue({ ...preview(), classroom: { id: learnerId, name: 'PRIVATE_FOREIGN_CLASS' } });
    const result = await run('preview'); expect(result.status).toBe(503); noLeak(await result.text());
  });
  it.each([
    () => ({ ...releaseReceipt(), actorId: learnerId }),
    () => ({ ...releaseReceipt(), publications: [] }),
    () => ({ ...releaseReceipt(), publications: [releaseReceipt().publications[0], releaseReceipt().publications[0]] }),
    () => ({ ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, gradeRevisionId: learnerId } }] }),
    () => ({ ...releaseReceipt(), publications: [{ recipientId, publication: { ...releaseReceipt().publications[0].publication, sequence: 2 } }] }),
  ])('never reports success for a release receipt that differs from the reviewed targets', async corrupt => {
    mocks.release.mockResolvedValue(corrupt()); const result = await run('release'); expect(result.status).toBe(503); privateResponse(result);
  });
  it('never reports class sharing success for a different sequence or audience count', async () => {
    for (const source of [{ ...sharingReceipt(), sequence: 2 }, { ...sharingReceipt(), recipientCount: 2 }, { ...sharingReceipt(), shared: false }]) {
      mocks.share.mockResolvedValue(source); const result = await run('share'); expect(result.status).toBe(503); privateResponse(result);
    }
  });
});

describe('class gradebook server page access', () => {
  it('provides an explicit administrative repository and the current actor to server pages', async () => {
    const result = await readClassGradebookData('admin', async (_repository, actor, db) => ({ actorId: actor.id, client: db !== null }));
    expect(result).toEqual({ status: 'authorized', data: { actorId, client: true } });
    expect(mocks.gradebookPrincipal).toHaveBeenCalledWith(expect.anything(), { role: 'administrator', userId: actorId }); noWrites();
  });
  it('keeps the teaching page owner-scoped even when the current user role is admin', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'admin' }] });
    await readClassGradebookData('teach', async (_repository, actor) => actor.id);
    expect(mocks.gradebookPrincipal).toHaveBeenCalledWith(expect.anything(), { role: 'instructor', userId: actorId }); noWrites();
  });
  it('provides the learner repository for shared result server pages', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const result = await readLearnerClassResultsData(async (_repository, actor) => actor.id);
    expect(result).toEqual({ status: 'authorized', data: actorId });
    expect(mocks.principal).toHaveBeenCalledWith(expect.anything(), { role: 'learner', userId: actorId }); noWrites();
  });
  it('distinguishes missing authentication from absent permission without turning outages into empty pages', async () => {
    mocks.session.mockResolvedValue(null); expect(await readClassGradebookData('admin', async () => null)).toEqual({ status: 'unauthenticated' });
    mocks.session.mockResolvedValue({ user: { id: actorId } }); mocks.roles.mockResolvedValue([]);
    expect(await readClassGradebookData('admin', async () => null)).toEqual({ status: 'forbidden' });
    mocks.session.mockRejectedValue(new Error('PRIVATE_AUTH_OUTAGE'));
    await expect(readClassGradebookData('admin', async () => null)).rejects.toThrow(); noWrites();
  });
});

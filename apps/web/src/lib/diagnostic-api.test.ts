import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';
import type { DiagnosticSaveReceipt, DiagnosticSubmissionReceipt, DiagnosticView } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), construct: vi.fn(), list: vi.fn(), read: vi.fn(), start: vi.fn(), save: vi.fn(), submit: vi.fn(), close: vi.fn(),
  AccessError: class DiagnosticAccessError extends Error {},
  ConflictError: class DiagnosticConflictError extends Error {
    constructor(readonly code = 'revision_changed') { super('private conflict detail'); }
  },
  ValidationError: class DiagnosticValidationError extends Error {},
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  DiagnosticAccessError: mocks.AccessError, DiagnosticConflictError: mocks.ConflictError, DiagnosticValidationError: mocks.ValidationError,
  PostgresPracticeDiagnosticRepository: class {
    list = mocks.list; read = mocks.read; start = mocks.start; save = mocks.save; submit = mocks.submit;
    constructor(database: unknown, principal: unknown, blueprint: unknown) { mocks.construct(database, principal, blueprint); }
  },
}));

import { GET as LIST, POST as START } from '@/app/api/learner/diagnostics/route';
import { GET as READ } from '@/app/api/learner/diagnostics/[diagnosticId]/route';
import { POST as SAVE } from '@/app/api/learner/diagnostics/[diagnosticId]/answers/route';
import { POST as SUBMIT } from '@/app/api/learner/diagnostics/[diagnosticId]/submissions/route';
import { getDiagnosticQuestionVersions } from './diagnostic-catalog.server';
import { practiceItems } from './content';

const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const diagnosticId = '33333333-3333-4333-8333-333333333333';
const requestKey = '44444444-4444-4444-8444-444444444444';
const stamp = '2026-10-29T20:00:00.000Z';
const pool = getDiagnosticQuestionVersions();
const questions = pool.map(toLearnerQuestion);
const answers = () => Object.fromEntries(questions.map(question => [question.versionId, null]));
const view = (): DiagnosticView => ({
  id: diagnosticId, selectionVersion: 'balanced-ten-v1', createdAt: stamp,
  questions, answerDraft: { revision: 0, answers: answers(), updatedAt: stamp }, submission: null, feedback: null,
});
const saveInput = () => ({ expectedRevision: 0, answers: { [questions[0].versionId]: questions[0].options[0].id }, requestKey });
const saveReceipt = (): DiagnosticSaveReceipt => ({ diagnosticId, requestKey, currentRevision: 1,
  answerDraft: { revision: 1, answers: { ...answers(), ...saveInput().answers }, updatedAt: stamp } });
const submitInput = () => ({ expectedRevision: 1, requestKey });
const submissionReceipt = (): DiagnosticSubmissionReceipt => ({ diagnosticId, requestKey, answerRevision: 1, submittedAt: stamp });
const context = (id = diagnosticId) => ({ params: Promise.resolve({ diagnosticId: id }) });
const get = (expectedOwner?: string) => new Request(`http://localhost/api/learner/diagnostics?learnerId=${otherOwner}`, {
  headers: expectedOwner === undefined ? {} : { 'x-diagnostic-owner': expectedOwner },
});
const post = (body = '{}', expectedOwner: string | null = owner, extra: Record<string, string> = {}) => new Request('http://localhost/api/learner/diagnostics', {
  method: 'POST', body, headers: { ...extra, ...(expectedOwner === null ? {} : { 'x-diagnostic-owner': expectedOwner }) },
});
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-diagnostic-owner');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: owner, role: 'learner' } });
  mocks.database.mockReturnValue({ close: mocks.close });
  mocks.list.mockResolvedValue({ current: view(), history: [] });
  mocks.read.mockResolvedValue(view()); mocks.start.mockResolvedValue(view());
  mocks.save.mockResolvedValue(saveReceipt()); mocks.submit.mockResolvedValue(submissionReceipt());
});

describe('personal diagnostic HTTP authorization and persistence', () => {
  it('lists only the verified account and does not create work during a read', async () => {
    const response = await LIST(get());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ learnerId: owner, current: view(), history: [] });
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true });
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), owner, { questions: pool, activityIds: practiceItems.map(item => item.id) });
    expect(mocks.list).toHaveBeenCalledOnce(); expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(['learner', 'instructor', 'administrator'])('keeps a %s skills check personal to the verified owner', async role => {
    mocks.session.mockResolvedValue({ user: { id: owner, role } });
    const response = await READ(get(owner), context());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ learnerId: owner, diagnostic: view() });
    expect(mocks.read).toHaveBeenCalledWith(diagnosticId);
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), owner, expect.anything());
  });

  it('starts or resumes the server-selected blueprint only through an explicit empty command', async () => {
    const response = await START(post());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ learnerId: owner, diagnostic: view() });
    expect(mocks.start).toHaveBeenCalledWith(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('saves only parsed choices, saved revision, and the immutable request identity', async () => {
    const response = await SAVE(post(JSON.stringify(saveInput())), context());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ learnerId: owner, receipt: saveReceipt() });
    expect(mocks.save).toHaveBeenCalledWith(diagnosticId, saveInput());
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), owner, expect.anything());
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('submits the pinned saved revision and returns a receipt without preemptive answer feedback', async () => {
    const response = await SUBMIT(post(JSON.stringify(submitInput())), context());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ learnerId: owner, receipt: submissionReceipt() });
    expect(mocks.submit).toHaveBeenCalledWith(diagnosticId, submitInput());
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('denies every guest endpoint before consuming malformed input or opening persistence', async () => {
    mocks.session.mockResolvedValue(null);
    const requests = [post('{'), post('{'), post('{')];
    const readers = requests.map(request => vi.spyOn(request.body!, 'getReader'));
    const responses = [await LIST(get()), await READ(get(), context('bad-id')),
      await START(requests[0]), await SAVE(requests[1], context('bad-id')), await SUBMIT(requests[2], context('bad-id'))];
    for (const response of responses) {
      expect(response.status).toBe(401); privateResponse(response);
      expect(await response.json()).toMatchObject({ code: 'authentication_required' });
    }
    readers.forEach(reader => expect(reader).not.toHaveBeenCalled());
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.construct).not.toHaveBeenCalled();
  });

  it('fails closed on session verification errors and never emits verification details', async () => {
    mocks.session.mockRejectedValue(new Error('SENSITIVE auth verification detail'));
    const request = post('{'), reader = vi.spyOn(request.body!, 'getReader');
    const response = await START(request);
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain('SENSITIVE');
    expect(reader).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([null, otherOwner, 'invalid-owner'])('rejects a missing or switched write owner (%s) before parsing', async expectedOwner => {
    for (const endpoint of [START, (request: Request) => SAVE(request, context()), (request: Request) => SUBMIT(request, context())]) {
      const request = post('{', expectedOwner), reader = vi.spyOn(request.body!, 'getReader');
      const response = await endpoint(request);
      expect(response.status).toBe(409); privateResponse(response);
      expect(await response.json()).toMatchObject({ code: 'owner_changed' });
      expect(reader).not.toHaveBeenCalled();
    }
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('rejects stale optional read guards before opening persistence', async () => {
    for (const response of [await LIST(get(otherOwner)), await READ(get(otherOwner), context())]) {
      expect(response.status).toBe(409); privateResponse(response);
      expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    }
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each(['bad-id', '../another-user', '00000000-0000-0000-0000-000000000000'])('rejects invalid route identities (%s) before reading write bodies', async id => {
    const save = post('{'), submit = post('{');
    const readers = [vi.spyOn(save.body!, 'getReader'), vi.spyOn(submit.body!, 'getReader')];
    for (const response of [await READ(get(), context(id)), await SAVE(save, context(id)), await SUBMIT(submit, context(id))]) {
      expect(response.status).toBe(400); privateResponse(response);
    }
    readers.forEach(reader => expect(reader).not.toHaveBeenCalled()); expect(mocks.database).not.toHaveBeenCalled();
  });
});

describe('personal diagnostic request validation', () => {
  it.each(['{', 'null', '[]', '0', 'true', '""', '{"snapshot":{}}', '{"learnerId":"another-owner"}', '{"score":100}', '{"a":1,"a":2}'])('requires an exact empty start object (%s)', async body => {
    const response = await START(post(body));
    expect(response.status).toBe(400); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([
    { ...saveInput(), snapshot: {} }, { ...saveInput(), score: 100 }, { ...saveInput(), learnerId: otherOwner },
    { ...saveInput(), correctOptionId: 'a' }, { ...saveInput(), expectedRevision: -1 }, { ...saveInput(), expectedRevision: 0.5 },
    { ...saveInput(), expectedRevision: '0' }, { ...saveInput(), requestKey: 'non-uuid-retry' },
    { ...saveInput(), requestKey: '' }, { ...saveInput(), answers: [] }, { ...saveInput(), answers: { 'not-a-version': 'a' } },
    { ...saveInput(), answers: { [questions[0].versionId]: { correct: true } } },
  ])('rejects malformed or client-authoritative saves before persistence: %j', async input => {
    const response = await SAVE(post(JSON.stringify(input)), context());
    expect(response.status).toBe(400); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([
    { ...submitInput(), answers: {} }, { ...submitInput(), snapshot: {} }, { ...submitInput(), score: 100 },
    { ...submitInput(), learnerId: otherOwner }, { ...submitInput(), requestKey: 'not-uuid' },
    { ...submitInput(), expectedRevision: -1 }, { ...submitInput(), expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects client final-answer or score injection before persistence: %j', async input => {
    const response = await SUBMIT(post(JSON.stringify(input)), context());
    expect(response.status).toBe(400); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('rejects duplicate keys at either nesting level, including escaped duplicate names', async () => {
    const qid = questions[0].versionId;
    for (const body of [
      `{"expectedRevision":0,"expectedRevision":1,"answers":{},"requestKey":"${requestKey}"}`,
      `{"expectedRevision":0,"answers":{"${qid}":"a","${qid}":"b"},"requestKey":"${requestKey}"}`,
      `{"expectedRevision":0,"answers":{},"requestKey":"${requestKey}","request\\u004bey":"${requestKey}"}`,
    ]) expect((await SAVE(post(body), context())).status).toBe(400);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('bounds all write bodies before opening persistence, counting actual UTF-8 bytes without a declared length', async () => {
    const cases = [
      { endpoint: START, maximum: 1000 },
      { endpoint: (request: Request) => SAVE(request, context()), maximum: 16000 },
      { endpoint: (request: Request) => SUBMIT(request, context()), maximum: 2000 },
    ];
    for (const { endpoint, maximum } of cases) {
      const response = await endpoint(post('🧠'.repeat(Math.ceil(maximum / 4) + 1)));
      expect(response.status).toBe(413); privateResponse(response);
      const request = post('{}', owner, { 'content-length': String(maximum + 1) });
      const reader = vi.spyOn(request.body!, 'getReader');
      expect((await endpoint(request)).status).toBe(413); expect(reader).not.toHaveBeenCalled();
    }
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('rejects excessively nested and invalid UTF-8 JSON', async () => {
    expect((await START(post('['.repeat(34) + '0' + ']'.repeat(34)))).status).toBe(400);
    const request = new Request('http://localhost/api/learner/diagnostics', { method: 'POST', headers: { 'x-diagnostic-owner': owner }, body: new Uint8Array([0xc3, 0x28]) });
    expect((await START(request)).status).toBe(400); expect(mocks.database).not.toHaveBeenCalled();
  });
});

describe('personal diagnostic response privacy and failures', () => {
  it('removes private fields at every question, draft, and history nesting level and hides premature feedback', async () => {
    const source = view();
    const sensitive = { correctOptionId: 'SENSITIVE-key', explanation: 'SENSITIVE-explanation', misconceptionTags: ['SENSITIVE-tag'], review: { reviewerId: 'SENSITIVE-reviewer' }, provenance: 'SENSITIVE-author', rawGrade: 'SENSITIVE-grade' };
    const poisoned = { ...source, ...sensitive,
      questions: source.questions.map(question => ({ ...question, ...sensitive, options: question.options.map(option => ({ ...option, ...sensitive })) })),
      answerDraft: { ...source.answerDraft, ...sensitive, answers: { ...source.answerDraft.answers, extraPrivateAnswer: 'SENSITIVE-extra' } },
      feedback: { answeredCount: 10, correctCount: 10, totalQuestions: 10, items: [{ ...sensitive }] },
    };
    const history = { id: diagnosticId, selectionVersion: source.selectionVersion, submittedAt: stamp, answeredCount: 1, correctCount: 0, totalQuestions: 10 };
    mocks.list.mockResolvedValue({ current: poisoned, history: [{ ...history, ...sensitive, answers: 'SENSITIVE-answers' }] });
    mocks.read.mockResolvedValue(poisoned); mocks.start.mockResolvedValue(poisoned);
    const list = await (await LIST(get())).json();
    expect(list).toEqual({ learnerId: owner, current: source, history: [history] });
    for (const response of [await READ(get(), context()), await START(post())]) {
      const body = await response.json(); expect(body).toEqual({ learnerId: owner, diagnostic: source });
      expect(JSON.stringify(body)).not.toContain('SENSITIVE');
    }
  });

  it('releases only the dedicated final feedback fields after an immutable submission exists', async () => {
    const source = view(); source.submission = submissionReceipt();
    const feedback = { answeredCount: 1, correctCount: 1, totalQuestions: 10,
      items: [{ questionVersionId: questions[0].versionId, selectedOptionId: pool[0].correctOptionId, correct: true,
        correctOptionId: pool[0].correctOptionId, explanation: pool[0].explanation }] };
    source.feedback = feedback;
    mocks.read.mockResolvedValue({ ...source,
      submission: { ...source.submission, rawGrade: 'SENSITIVE-grade' },
      feedback: { ...feedback, rawSnapshot: 'SENSITIVE-snapshot', items: feedback.items.map(item => ({ ...item, misconceptionTags: ['SENSITIVE-tag'], review: 'SENSITIVE-review' })) },
    });
    const response = await READ(get(owner), context()); privateResponse(response);
    const body = await response.json(); expect(body).toEqual({ learnerId: owner, diagnostic: source });
    expect(body.diagnostic.feedback.items[0].explanation).toBe(pool[0].explanation);
    expect(JSON.stringify(body)).not.toContain('SENSITIVE');
    expect(body.diagnostic.questions[0]).not.toHaveProperty('correctOptionId');
  });

  it('returns exact allowlisted save and submission receipts without spreading private metadata', async () => {
    const saved = saveReceipt();
    mocks.save.mockResolvedValue({ ...saved, rawSnapshot: 'SENSITIVE-snapshot', privateNote: 'SENSITIVE-note',
      answerDraft: { ...saved.answerDraft, sourceId: 'SENSITIVE-source', misconceptionTags: ['SENSITIVE-tag'] } });
    mocks.submit.mockResolvedValue({ ...submissionReceipt(), rawGrade: 'SENSITIVE-grade', correctOptionId: 'SENSITIVE-key' });
    const save = await (await SAVE(post(JSON.stringify(saveInput())), context())).json();
    const submit = await (await SUBMIT(post(JSON.stringify(submitInput())), context())).json();
    expect(save).toEqual({ learnerId: owner, receipt: saved });
    expect(submit).toEqual({ learnerId: owner, receipt: submissionReceipt() });
    expect(JSON.stringify([save, submit])).not.toContain('SENSITIVE');
  });

  it('preserves an older accepted save receipt and its newer current revision for explicit comparison', async () => {
    mocks.save.mockResolvedValue({ ...saveReceipt(), currentRevision: 8 });
    const response = await SAVE(post(JSON.stringify(saveInput())), context());
    expect(await response.json()).toMatchObject({ learnerId: owner, receipt: { answerDraft: { revision: 1 }, currentRevision: 8, requestKey } });
  });

  it.each([
    [new mocks.AccessError('SENSITIVE account lookup'), 404, 'not_found'],
    [new mocks.ValidationError('SENSITIVE pinned snapshot'), 400, 'invalid_request'],
    [new mocks.ConflictError('revision_changed'), 409, 'revision_changed'],
    [new mocks.ConflictError('request_reused'), 409, 'request_reused'],
    [new mocks.ConflictError('submitted'), 409, 'submitted'],
    [new Error('SENSITIVE SQL or database detail'), 503, 'diagnostic_unavailable'],
  ] as const)('sanitizes persistence failure %j while closing the database', async (error, status, code) => {
    mocks.save.mockRejectedValue(error);
    const response = await SAVE(post(JSON.stringify(saveInput())), context());
    expect(response.status).toBe(status); privateResponse(response);
    const body = await response.json(); expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toMatch(/SENSITIVE|private conflict detail/);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('closes failed construction and reads without emitting a partial successful response', async () => {
    mocks.construct.mockImplementationOnce(() => { throw new Error('SENSITIVE constructor detail'); });
    const start = await START(post());
    expect(start.status).toBe(503); expect(await start.text()).not.toContain('SENSITIVE');
    expect(mocks.close).toHaveBeenCalledOnce();
    mocks.close.mockClear(); mocks.read.mockRejectedValueOnce(new Error('SENSITIVE read detail'));
    const read = await READ(get(), context());
    expect(read.status).toBe(503); privateResponse(read);
    expect(await read.text()).not.toContain('SENSITIVE'); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('does not claim a confirmed write if connection closure fails after persistence', async () => {
    mocks.close.mockRejectedValue(new Error('SENSITIVE transport failure'));
    const response = await SUBMIT(post(JSON.stringify(submitInput())), context());
    expect(response.status).toBe(503); privateResponse(response);
    const body = await response.json(); expect(body.code).toBe('diagnostic_unavailable'); expect(body.receipt).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('SENSITIVE'); expect(mocks.submit).toHaveBeenCalledWith(diagnosticId, submitInput());
  });
});

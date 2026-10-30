import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearningEvidenceSnapshot } from '@leetcode-app/domain';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), construct: vi.fn(), read: vi.fn(), snooze: vi.fn(), select: vi.fn(), decisionKey: vi.fn(), close: vi.fn(),
  AccessError: class LearningEvidenceAccessError extends Error {},
  ConflictError: class LearningEvidenceConflictError extends Error {},
  ValidationError: class LearningEvidenceValidationError extends Error {},
}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database,
  databaseConfigFromEnv: () => ({}),
  LearningEvidenceAccessError: mocks.AccessError,
  LearningEvidenceConflictError: mocks.ConflictError,
  LearningEvidenceValidationError: mocks.ValidationError,
  learningDecisionKey: mocks.decisionKey,
  PostgresLearningEvidenceRepository: class {
    readSnapshot = mocks.read;
    snoozeReview = mocks.snooze;
    selectRecommendation = mocks.select;
    constructor(database: unknown, principal: unknown) { mocks.construct(database, principal); }
  },
}));

import { GET } from '@/app/api/learner/learning/route';
import { POST } from '@/app/api/learner/learning/reviews/route';
import { POST as SELECT } from '@/app/api/learner/learning/recommendations/route';
import { learningApiResponse, learningPracticeCatalog } from './learning-api';

const owner = '11111111-1111-4111-8111-111111111111';
const otherOwner = '22222222-2222-4222-8222-222222222222';
const snapshot = (): LearningEvidenceSnapshot => ({
  algorithmVersion: 'learning-evidence-v1', generatedAt: '2026-10-27T12:00:00.000Z', optOut: false,
  concepts: [{ conceptId: 'hashing', score: 40, confidence: 0.2, uncertainty: { lower: 10, upper: 80 }, evidenceStatus: 'limited',
    independentItems: 1, lastEvidenceAt: '2026-10-26T12:00:00.000Z', reviewDueAt: '2026-10-27T12:00:00.000Z', reviewRevision: 4 }],
  recentActivityIds: ['pair-with-target-v1'],
  sourceSummary: { releasedQuizItems: 1, verifiedPracticeItems: 0, independentItems: 1 },
  processing: { pending: false, processedSources: 1, remainingSources: 0 },
});
const input = () => ({ conceptId: 'hashing', expectedRevision: 4, days: 3, requestKey: 'review-retry-1' });
const receipt = () => ({ conceptId: 'hashing', requestKey: 'review-retry-1', previousRevision: 4, revision: 5, dueAt: '2026-10-30T12:00:00.000Z' });
const selection = () => ({ practiceId: 'pair-with-target-v1', expectedDecisionKey: 'a'.repeat(64), requestKey: 'practice-retry-1' });
const selectionReceipt = () => ({ practiceId: selection().practiceId, requestKey: selection().requestKey,
  decisionKey: selection().expectedDecisionKey, selectionId: '33333333-3333-4333-8333-333333333333', selectedAt: '2026-10-29T12:00:00.000Z' });
const getRequest = (expectedOwner?: string) => new Request('http://localhost/api/learner/learning?learnerId=' + otherOwner, {
  headers: expectedOwner === undefined ? {} : { 'x-learning-owner': expectedOwner },
});
const postRequest = (body = JSON.stringify(input()), expectedOwner: string | null = owner) => new Request('http://localhost/api/learner/learning/reviews', {
  method: 'POST', body, headers: expectedOwner === null ? {} : { 'x-learning-owner': expectedOwner },
});
const privateResponse = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-learning-owner');
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: owner, role: 'learner' } });
  mocks.database.mockReturnValue({ close: mocks.close });
  mocks.read.mockResolvedValue(snapshot());
  mocks.snooze.mockResolvedValue({ snapshot: snapshot(), receipt: receipt() });
  mocks.select.mockResolvedValue(selectionReceipt());
  mocks.decisionKey.mockReturnValue(selection().expectedDecisionKey);
});

describe('account learning API authorization and persistence boundary', () => {
  it('reads the verified session owner and ignores identity supplied in the URL', async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toMatchObject({ learnerId: owner, snapshot: snapshot(), plan: { status: 'ready' } });
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true });
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: owner, practiceCatalog: learningPracticeCatalog, practiceGradeVersion: 'code-tests-v3' }));
    expect(mocks.read).toHaveBeenCalledOnce(); expect(mocks.snooze).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(['instructor', 'administrator'])('permits a signed-in %s to read only their own personal practice', async role => {
    mocks.session.mockResolvedValue({ user: { id: owner, role } });
    expect((await GET(getRequest(owner))).status).toBe(200);
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: owner }));
  });

  it('denies guests before reading a malformed body or opening persistence', async () => {
    mocks.session.mockResolvedValue(null);
    const request = postRequest('{');
    const getReader = vi.spyOn(request.body!, 'getReader');
    for (const response of [await GET(getRequest()), await POST(request)]) {
      expect(response.status).toBe(401); privateResponse(response);
      expect(await response.json()).toMatchObject({ code: 'authentication_required' });
    }
    expect(getReader).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.construct).not.toHaveBeenCalled();
  });

  it('fails closed if session verification fails instead of falling back to guest or local evidence', async () => {
    mocks.session.mockRejectedValue(new Error('private session token validation failure'));
    const response = await POST(postRequest('{'));
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain('token');
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([null, otherOwner, 'invalid-owner'])('rejects missing or switched write ownership (%s) before parsing', async expectedOwner => {
    const request = postRequest('{', expectedOwner);
    const getReader = vi.spyOn(request.body!, 'getReader');
    const response = await POST(request);
    expect(response.status).toBe(409); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    expect(getReader).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });

  it('rejects a stale optional read guard before opening persistence', async () => {
    const response = await GET(getRequest(otherOwner));
    expect(response.status).toBe(409); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });

  it('persists only the owner-scoped review command and returns its authoritative receipt', async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toMatchObject({ learnerId: owner, snapshot: snapshot(), reviewReceipt: receipt() });
    expect(mocks.snooze).toHaveBeenCalledWith(input());
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: owner }));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('preserves a previous accepted retry receipt while returning a newer current projection', async () => {
    const current = snapshot(); current.concepts[0].reviewRevision = 8;
    current.concepts[0].reviewDueAt = '2026-11-10T12:00:00.000Z';
    mocks.snooze.mockResolvedValue({ snapshot: current, receipt: receipt() });
    const response = await POST(postRequest());
    const body = await response.json();
    expect(body.reviewReceipt).toEqual(receipt());
    expect(body.snapshot.concepts[0].reviewRevision).toBe(8);
    expect(body.snapshot.concepts[0].reviewDueAt).toBe('2026-11-10T12:00:00.000Z');
  });

  it.each([
    '{', JSON.stringify({ ...input(), score: 100 }), JSON.stringify({ ...input(), learnerId: otherOwner }),
    '{"conceptId":"hashing","expectedRevision":4,"days":3,"days":7,"requestKey":"key"}',
  ])('rejects malformed or client-authoritative writes before database access', async body => {
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.snooze).not.toHaveBeenCalled();
  });

  it('rejects oversized authorized bodies with a private 413 response before database access', async () => {
    const response = await POST(postRequest(JSON.stringify({ ...input(), padding: 'x'.repeat(4_001) })));
    expect(response.status).toBe(413); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([
    [mocks.AccessError, 403, 'access_denied'],
    [mocks.ConflictError, 409, 'review_conflict'],
    [mocks.ValidationError, 400, 'invalid_request'],
    [Error, 503, 'learning_unavailable'],
  ] as const)('maps %s without exposing internal details and always closes its database', async (ErrorType, status, code) => {
    mocks.snooze.mockRejectedValue(new ErrorType('SECRET: grade privateNote, source IDs, SQL and answer key'));
    const response = await POST(postRequest());
    expect(response.status).toBe(status); privateResponse(response);
    const body = await response.json(); expect(body.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain('SECRET');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('closes a failing read and returns no stale success payload', async () => {
    mocks.read.mockRejectedValue(new Error('private projection failure'));
    const response = await GET(getRequest());
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'learning_unavailable' });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('account learning response privacy allowlist', () => {
  it('removes private source metadata at each aggregate nesting level', async () => {
    const source = snapshot();
    const privateFields = { privateNote: 'SECRET-private-note', correctOptionId: 'SECRET-key', sourceId: 'SECRET-source', misconceptionTags: ['SECRET-tag'] };
    Object.assign(source, privateFields, { questions: ['SECRET-question'] });
    Object.assign(source.concepts[0], privateFields);
    Object.assign(source.concepts[0].uncertainty, privateFields);
    Object.assign(source.sourceSummary, privateFields);
    Object.assign(source.processing, privateFields);
    mocks.read.mockResolvedValue(source);
    const response = await GET(getRequest()); const body = await response.json();
    expect(body.snapshot).toEqual(snapshot());
    expect(JSON.stringify(body)).not.toContain('SECRET');
    expect(JSON.stringify(body.plan)).not.toMatch(/correctOptionId|misconceptionTags|privateNote|contentId/);
    expect(body.plan.recommendations.length).toBeGreaterThan(0);
  });

  it('strips private receipt fields instead of spreading database results', async () => {
    mocks.snooze.mockResolvedValue({ snapshot: snapshot(), receipt: { ...receipt(), sourceId: 'SECRET-source', privateNote: 'SECRET-note' }, rawGrade: 'SECRET-grade' });
    const body = await (await POST(postRequest())).json();
    expect(body.reviewReceipt).toEqual(receipt());
    expect(JSON.stringify(body)).not.toContain('SECRET');
  });

  it('produces no recommendations while personalization is disabled', () => {
    const disabled = snapshot(); disabled.optOut = true; disabled.concepts = []; disabled.recentActivityIds = [];
    disabled.sourceSummary = { releasedQuizItems: 0, verifiedPracticeItems: 0, independentItems: 0 };
    expect(learningApiResponse(owner, disabled).plan).toEqual({ algorithmVersion: 'learning-evidence-v1', status: 'disabled', recommendations: [] });
    expect(learningApiResponse(owner, disabled).decisionKey).toBeNull();
  });

  it('returns an opaque selection key and only the optional diagnostic count from new source metadata', async () => {
    const source = snapshot();
    Object.assign(source.sourceSummary, { diagnosticItems: 3, answerKeys: ['private'], sourceIds: ['private'] });
    mocks.read.mockResolvedValue(source);
    const body = await (await GET(getRequest())).json();
    expect(body.decisionKey).toBe(selection().expectedDecisionKey);
    expect(body.snapshot.sourceSummary).toEqual({ ...snapshot().sourceSummary, diagnosticItems: 3 });
    expect(mocks.decisionKey).toHaveBeenCalledWith(expect.objectContaining({
      decisionVersion: 'learning-decision-v1', candidates: expect.any(Array), plan: body.plan,
    }));
    expect(body).not.toHaveProperty('candidates');
    expect(JSON.stringify(body)).not.toMatch(/answerKeys|sourceIds|knownConcepts|recentPenalty/);
  });
});

describe('explicit account recommendation selections', () => {
  it('records only the verified owner command and returns an explicit receipt allowlist', async () => {
    mocks.select.mockResolvedValue({ ...selectionReceipt(), decision: { private: 'internal evidence' }, sourceId: 'internal' });
    const response = await SELECT(postRequest(JSON.stringify(selection())));
    expect(response.status).toBe(200); privateResponse(response);
    expect(await response.json()).toEqual({ learnerId: owner, receipt: selectionReceipt() });
    expect(mocks.select).toHaveBeenCalledWith(selection());
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: owner }));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('returns the same accepted receipt on a repeated request', async () => {
    const first = await (await SELECT(postRequest(JSON.stringify(selection())))).json();
    const repeated = await (await SELECT(postRequest(JSON.stringify(selection())))).json();
    expect(repeated).toEqual(first);
    expect(mocks.select.mock.calls.map(call => call[0])).toEqual([selection(), selection()]);
  });

  it.each([null, otherOwner])('checks write ownership before decoding or persistence (%s)', async expectedOwner => {
    const request = postRequest('{', expectedOwner);
    const reader = vi.spyOn(request.body!, 'getReader');
    const response = await SELECT(request);
    expect(response.status).toBe(409); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    expect(reader).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
  });

  it('rejects guests before decoding a selection', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await SELECT(postRequest('{'));
    expect(response.status).toBe(401); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([
    '{', JSON.stringify({ ...selection(), learnerId: otherOwner }), JSON.stringify({ ...selection(), score: 100 }),
    JSON.stringify({ ...selection(), redirectUrl: 'https://example.test' }),
    '{"practiceId":"pair-with-target-v1","practiceId":"coin-change-lite-v1","expectedDecisionKey":"' + 'a'.repeat(64) + '","requestKey":"key"}',
  ])('rejects ambiguous or client-authoritative selection data', async body => {
    const response = await SELECT(postRequest(body));
    expect(response.status).toBe(400); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('bounds selection input and hides private failure details', async () => {
    const tooLarge = await SELECT(postRequest(JSON.stringify({ ...selection(), padding: 'x'.repeat(4_001) })));
    expect(tooLarge.status).toBe(413); privateResponse(tooLarge);
    expect(mocks.database).not.toHaveBeenCalled();
    mocks.select.mockRejectedValue(new Error('private SQL, source answers and configuration'));
    const response = await SELECT(postRequest(JSON.stringify(selection())));
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toMatch(/SQL|answers|configuration/);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('requires a new plan after a stale decision or rejected key instead of retrying as a new selection', async () => {
    mocks.select.mockRejectedValue(new mocks.ConflictError('private decision factors'));
    const response = await SELECT(postRequest(JSON.stringify(selection())));
    expect(response.status).toBe(409); privateResponse(response);
    expect(await response.json()).toEqual({ code: 'recommendation_conflict', error: 'Your recommended practice changed. Load the latest plan before choosing again.' });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

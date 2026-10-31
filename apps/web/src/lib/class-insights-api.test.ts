import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassInsightsReport } from '@leetcode-app/domain';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), database: vi.fn(), query: vi.fn(), close: vi.fn(), construct: vi.fn(),
  read: vi.fn(), classroom: vi.fn(), roles: vi.fn(),
  AccessError: class ClassInsightsAccessError extends Error {},
}));
vi.mock('server-only', () => ({}));
vi.mock('./auth/session', () => ({ getSession: mocks.session }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.database, databaseConfigFromEnv: () => ({}),
  ClassInsightsAccessError: mocks.AccessError,
  PostgresAdministrationRepository: class { listActiveRoles = mocks.roles; },
  PostgresClassInsightsRepository: class {
    read = mocks.read; readClassroom = mocks.classroom;
    constructor(database: unknown, principal: unknown) { mocks.construct(database, principal); }
  },
}));

import { GET } from '@/app/api/classes/[classId]/insights/route';
import { classInsightConceptIds, readClassFollowUpSeed, readClassInsightsPage } from './class-insights-api';
import { getReviewedQuestionVersions } from './question-bank.server';

const actorId = '11111111-1111-4111-8111-111111111111';
const otherActorId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-abcd-4333-8333-333333333333';
const otherClassId = '44444444-4444-4444-8444-444444444444';
const generatedAt = '2026-10-30T15:00:00.000Z';
function report(view: ClassInsightsReport['view'] = 'owner'): ClassInsightsReport {
  return {
    algorithmVersion: 'class-insights-v1', classroom: { id: classId, name: 'Synthetic concept studio' }, generatedAt,
    view, adminMinimumLearners: 5, rosterCount: 8,
    concepts: [
      { conceptId: 'hash-maps', coverageStatus: 'covered', answeredItems: 18, correctItems: 6,
        coveredLearners: 6, distinctQuestions: 3, observedCorrectPercent: 33, coveragePercent: 75 },
      { conceptId: 'sliding-window', coverageStatus: 'limited', answeredItems: 6, correctItems: 4,
        coveredLearners: 6, distinctQuestions: 1, observedCorrectPercent: 67, coveragePercent: 75 },
      { conceptId: 'tree-recursion', coverageStatus: 'unknown', answeredItems: 0, correctItems: 0,
        coveredLearners: 0, distinctQuestions: 0, observedCorrectPercent: null, coveragePercent: 0 },
    ],
  };
}
const data = (view: ClassInsightsReport['view'] = 'owner') => ({ report: report(view), assignedQuestionIds: ['pair-distinct-indices'] });
const request = (query = 'workspace=teach', expectedActor: string | undefined = actorId) => new Request(`http://localhost/api/classes/${classId}/insights?${query}`, {
  headers: expectedActor === undefined ? {} : { 'x-class-insights-owner': expectedActor },
});
const context = (id = classId) => ({ params: Promise.resolve({ classId: id }) });
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-class-insights-owner');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: actorId, role: 'learner' } });
  mocks.query.mockResolvedValue({ rows: [{ role: 'instructor' }] });
  mocks.database.mockReturnValue({ query: mocks.query, close: mocks.close });
  mocks.roles.mockResolvedValue(['administrator']);
  mocks.read.mockResolvedValue(data());
  mocks.classroom.mockResolvedValue({ id: classId, name: 'Synthetic concept studio' });
});

describe('class insight HTTP identity and scope', () => {
  it('uses verified identity and server-controlled concepts for an owned instructor class', async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200); privateResponse(response);
    const body = await response.json();
    expect(body.actorId).toBe(actorId); expect(body.report).toEqual(report());
    expect(mocks.session).toHaveBeenCalledWith({ failOnAuthError: true });
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), { userId: actorId, role: 'instructor', conceptIds: classInsightConceptIds() });
    expect(mocks.query).toHaveBeenCalledWith('SELECT role FROM users WHERE id=$1', [actorId]);
    expect(mocks.read).toHaveBeenCalledWith(classId); expect(mocks.classroom).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('denies guests before invalid query or class parsing and never opens storage', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request('workspace=invalid&focus=PRIVATE_FIELD'), context('invalid-id'));
    expect(response.status).toBe(401); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'authentication_required' });
    expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });

  it('fails closed on session verification failure without leaking its error', async () => {
    mocks.session.mockRejectedValue(new Error('PRIVATE_SESSION_VALIDATION_CANARY'));
    const response = await GET(request(), context());
    expect(response.status).toBe(503); privateResponse(response);
    expect(await response.text()).not.toContain('PRIVATE_SESSION');
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each([otherActorId, 'invalid-owner', ''])('rejects a switched read owner (%s) before input parsing or storage', async expectedActor => {
    const response = await GET(request('workspace=invalid', expectedActor), context('invalid-id'));
    expect(response.status).toBe(409); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('allows an initial read without an optional expected-owner guard', async () => {
    const response = await GET(new Request(`http://localhost/api/classes/${classId}/insights?workspace=teach`), context());
    expect(response.status).toBe(200); expect((await response.json()).actorId).toBe(actorId);
  });

  it('ignores session display-role claims and checks the current stored instructor role', async () => {
    mocks.session.mockResolvedValue({ user: { id: actorId, role: 'administrator', displayName: 'instructor' } });
    mocks.query.mockResolvedValue({ rows: [{ role: 'learner' }] });
    const response = await GET(request(), context());
    expect(response.status).toBe(403); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'forbidden' });
    expect(mocks.construct).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('permits a legacy admin label only through owned instructor scope', async () => {
    mocks.query.mockResolvedValue({ rows: [{ role: 'admin' }] });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'instructor', userId: actorId }));
    expect(mocks.roles).not.toHaveBeenCalled();
  });

  it('uses active platform capabilities and administrator aggregate mode for the admin workspace', async () => {
    const source = data('administrator');
    source.report.concepts[2] = { ...source.report.concepts[2], answeredItems: null, correctItems: null,
      coveredLearners: null, distinctQuestions: null, coveragePercent: null };
    mocks.read.mockResolvedValue(source);
    const response = await GET(request('workspace=admin'), context());
    expect(response.status).toBe(200); privateResponse(response);
    expect((await response.json()).report.view).toBe('administrator');
    expect(mocks.roles).toHaveBeenCalledWith(actorId);
    expect(mocks.construct).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'administrator', userId: actorId }));
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([[], ['support'], ['content_author'], ['content_reviewer'], ['privacy_operator'], ['evaluator_reviewer'], ['rights_reviewer']].map(roles => ({ roles })))('denies administration roles without the insight capability: $roles', async ({ roles }) => {
    mocks.roles.mockResolvedValue(roles);
    const response = await GET(request('workspace=admin'), context());
    expect(response.status).toBe(403); privateResponse(response);
    expect(mocks.construct).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('lets repository reauthorization deny a revocation or unowned class without exposing existence', async () => {
    mocks.read.mockRejectedValue(new mocks.AccessError('PRIVATE_CLASS_OWNER_CANARY'));
    for (const workspace of ['teach', 'admin']) {
      const response = await GET(request(`workspace=${workspace}`), context());
      expect(response.status).toBe(404); privateResponse(response);
      const body = await response.json(); expect(body.code).toBe('not_found');
      expect(JSON.stringify(body)).not.toContain('PRIVATE_CLASS');
    }
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });
});

describe('bounded class/focus input and persistence failures', () => {
  it.each([
    '', 'workspace=learner', 'workspace=teach&workspace=admin', 'workspace=teach&actorId=111',
    'workspace=teach&focus=', 'workspace=teach&focus=hash-maps&focus=tree-recursion',
    'workspace=teach&focus=hash-maps,hash-maps', 'workspace=teach&focus=unknown-concept',
    'workspace=teach&focus=hash-maps,tree-recursion,sliding-window,recurrence',
    'workspace=teach&focus=%3Cscript%3E', `workspace=teach&focus=${'a'.repeat(243)}`,
  ])('rejects ambiguous, foreign or oversized query input before storage: %s', async query => {
    const response = await GET(request(query), context());
    expect(response.status).toBe(400); privateResponse(response);
    expect(await response.json()).toMatchObject({ code: 'invalid_request' });
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-class', otherClassId.replaceAll('-', ''), '00000000-0000-0000-0000-000000000000'])('rejects malformed class identifiers before storage: %s', async id => {
    const response = await GET(request(), context(id));
    expect(response.status).toBe(400); privateResponse(response);
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it('normalizes valid focus order and forwards a lowercase class identity', async () => {
    const response = await GET(request('workspace=teach&focus=tree-recursion,hash-maps'), context(classId.toUpperCase()));
    expect(response.status).toBe(200);
    expect((await response.json()).suggestion.focusConceptIds).toEqual(['hash-maps', 'tree-recursion']);
    expect(mocks.read).toHaveBeenCalledWith(classId);
  });

  it.each(['query', 'roles', 'read', 'close'] as const)('sanitizes a %s failure without returning a stale success payload', async operation => {
    mocks[operation].mockRejectedValue(new Error('PRIVATE_SQL_AND_ROLE_CANARY'));
    const response = await GET(request(operation === 'roles' ? 'workspace=admin' : 'workspace=teach'), context());
    expect(response.status).toBe(503); privateResponse(response);
    const body = await response.json(); expect(body.code).toBe('insights_unavailable');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_SQL'); expect(body.report).toBeUndefined();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('sanitizes database construction failure without claiming a report was loaded', async () => {
    mocks.database.mockImplementation(() => { throw new Error('PRIVATE_CONNECTION_CANARY'); });
    const response = await GET(request(), context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE_CONNECTION');
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

describe('class insight and suggestion response privacy', () => {
  it('returns safe reviewed class questions and excludes questions already assigned to this class', async () => {
    const response = await GET(request('workspace=teach&focus=hash-maps'), context());
    const body = await response.json(); expect(response.status).toBe(200);
    expect(body.suggestion.questions.length).toBeGreaterThan(0); expect(body.suggestion.questions.length).toBeLessThanOrEqual(6);
    const pool = new Map(getReviewedQuestionVersions().map(question => [question.versionId, question]));
    for (const question of body.suggestion.questions) {
      expect(question.questionId).not.toBe('pair-distinct-indices');
      expect(question.questionId).not.toMatch(/^diagnostic-/);
      expect(pool.has(question.versionId)).toBe(true);
      expect(question.difficulty).not.toBe('advanced'); expect(question.conceptIds).toContain('hash-maps');
      expect(question).not.toHaveProperty('correctOptionId'); expect(question).not.toHaveProperty('review');
      expect(question).not.toHaveProperty('provenance'); expect(question).not.toHaveProperty('explanation');
      for (const option of question.options) expect(Object.keys(option).sort()).toEqual(['id', 'text']);
    }
    expect(body).not.toHaveProperty('assignedQuestionIds');
    expect(body.report).not.toHaveProperty('observations');
  });

  it('allowlists report fields at every nesting level and never spreads internal facts', async () => {
    const source = data();
    const privateFields = { learnerId: otherActorId, privateNote: 'PRIVATE_GRADE_NOTE_CANARY', correctOptionId: 'PRIVATE_ANSWER_KEY_CANARY', rawScore: 17, sourceId: 'PRIVATE_SOURCE_CANARY' };
    Object.assign(source, privateFields, { observations: [privateFields] });
    Object.assign(source.report, privateFields, { observations: [privateFields] });
    Object.assign(source.report.classroom, privateFields);
    Object.assign(source.report.concepts[0], privateFields);
    mocks.read.mockResolvedValue(source);
    const response = await GET(request(), context()); const body = await response.json();
    expect(response.status).toBe(200); expect(body.report).toEqual(report());
    expect(JSON.stringify(body)).not.toContain('PRIVATE_');
    expect(JSON.stringify(body.report)).not.toMatch(/learnerId|correctOptionId|privateNote|sourceId|rawScore|observations/);
  });

  it('fails closed if a report belongs to a different class', async () => {
    const source = data(); source.report.classroom.id = otherClassId; mocks.read.mockResolvedValue(source);
    const response = await GET(request(), context());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('Synthetic concept studio');
  });

  it.each([['admin', 'owner'], ['teach', 'administrator']] as const)('fails closed when workspace %s receives report view %s', async (workspace, view) => {
    mocks.read.mockResolvedValue(data(view));
    const response = await GET(request(`workspace=${workspace}`), context());
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: 'insights_unavailable' });
  });

  it('does not derive priority, question selection or reasons from suppressed admin correctness', async () => {
    const source = data('administrator');
    source.report.concepts = source.report.concepts.map(concept => ({ ...concept, coverageStatus: 'suppressed',
      answeredItems: null, correctItems: null, coveredLearners: null, distinctQuestions: null, observedCorrectPercent: null, coveragePercent: null }));
    mocks.read.mockResolvedValue(source);
    const first = await (await GET(request('workspace=admin'), context())).json();
    const reordered = structuredClone(source); reordered.report.generatedAt = '2026-10-30T16:00:00.000Z';
    Object.assign(reordered, { privateHiddenCorrectCount: 0, privateHiddenAnswerCount: 100, privateWeakConceptId: 'tree-recursion' });
    mocks.read.mockResolvedValue(reordered);
    const second = await (await GET(request('workspace=admin'), context())).json();
    expect(first.suggestion).toEqual(second.suggestion);
    for (const concept of second.report.concepts) {
      expect(concept.observedCorrectPercent).toBeNull(); expect(concept.correctItems).toBeNull(); expect(concept.answeredItems).toBeNull();
    }
    expect(JSON.stringify(second)).not.toContain('privateHidden');
  });

  it('defensively suppresses inconsistent upstream small-cohort metrics before ranking suggestions', async () => {
    const source = data('administrator');
    source.report.concepts = source.report.concepts.map(concept => ({ ...concept, coverageStatus: 'covered',
      answeredItems: 6, correctItems: 0, coveredLearners: 2, distinctQuestions: 3, observedCorrectPercent: 0, coveragePercent: 25 }));
    mocks.read.mockResolvedValue(source);
    const first = await (await GET(request('workspace=admin'), context())).json();
    const changed = structuredClone(source);
    changed.report.concepts[0].observedCorrectPercent = 100; changed.report.concepts[0].correctItems = 6;
    changed.report.concepts[1].observedCorrectPercent = 50; changed.report.concepts[1].correctItems = 3;
    mocks.read.mockResolvedValue(changed);
    const second = await (await GET(request('workspace=admin'), context())).json();
    expect(second.report).toEqual(first.report); expect(second.suggestion).toEqual(first.suggestion);
    for (const concept of second.report.concepts) {
      expect(concept.coverageStatus).toBe('suppressed'); expect(concept.coveredLearners).toBeNull();
      expect(concept.observedCorrectPercent).toBeNull(); expect(concept.correctItems).toBeNull();
    }
  });

  it('returns an explicit empty suggestion instead of silently repeating used logical questions', async () => {
    const source = data(); source.assignedQuestionIds = getReviewedQuestionVersions().map(question => question.questionId); mocks.read.mockResolvedValue(source);
    const response = await GET(request('workspace=teach&focus=hash-maps'), context());
    const body = await response.json(); expect(response.status).toBe(200);
    expect(body.suggestion.questions).toEqual([]); expect(body.suggestion.emptyReason).toBeTruthy();
    expect(body.suggestion.unavailableConceptIds).toEqual(['hash-maps']);
  });
});

describe('server page and editable follow-up seed boundaries', () => {
  it('reads only authorized classroom identity for page mounting', async () => {
    expect(await readClassInsightsPage('teach', classId)).toEqual({ status: 'authorized', actorId,
      classroom: { id: classId, name: 'Synthetic concept studio' } });
    expect(mocks.classroom).toHaveBeenCalledWith(classId); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('classifies page access failures without returning private classroom data', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect(await readClassInsightsPage('teach', classId)).toEqual({ status: 'unauthenticated' });
    mocks.query.mockResolvedValueOnce({ rows: [{ role: 'learner' }] });
    expect(await readClassInsightsPage('teach', classId)).toEqual({ status: 'forbidden' });
    mocks.classroom.mockRejectedValueOnce(new mocks.AccessError('PRIVATE_CLASS_CANARY'));
    expect(await readClassInsightsPage('teach', classId)).toEqual({ status: 'not_found' });
    expect(await readClassInsightsPage('teach', 'bad-id')).toEqual({ status: 'not_found' });
  });

  it('creates a stable canonical focus seed without saving or assigning anything', async () => {
    const first = await readClassFollowUpSeed('teach', classId, 'tree-recursion,hash-maps');
    const second = await readClassFollowUpSeed('teach', classId, 'hash-maps,tree-recursion');
    expect(first.seedKey).toBe('focus:hash-maps:tree-recursion'); expect(second.seedKey).toBe(first.seedKey);
    expect(first.actorId).toBe(actorId); expect(first.suggestion.questions.length).toBeGreaterThan(0);
    expect(mocks.read).toHaveBeenCalledTimes(2); expect(mocks.classroom).not.toHaveBeenCalled();
    expect(JSON.stringify(first)).not.toMatch(/correctOptionId|misconceptionTags|privateNote|sourceId/);
  });

  it.each([undefined, null, '', [], 'unknown-concept', 'hash-maps,hash-maps'])('refuses invalid or absent follow-up focus: %j', async focus => {
    await expect(readClassFollowUpSeed('teach', classId, focus)).rejects.toBeInstanceOf(Error);
    expect(mocks.database).not.toHaveBeenCalled();
  });
});

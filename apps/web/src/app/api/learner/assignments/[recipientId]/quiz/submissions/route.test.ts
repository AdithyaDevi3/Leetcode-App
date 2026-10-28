import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizAssignmentAccessError, QuizAssignmentConflictError, QuizAssignmentValidationError } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({ learner: vi.fn(), submit: vi.fn() }));
vi.mock('@/lib/quiz-assignment.server', () => ({ readQuizLearnerData: mocks.learner }));

const recipientId = '11111111-1111-4111-8111-111111111111';
const learnerId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ recipientId }) };
const input = () => ({ expectedRevision: 3, requestKey: 'submit-quiz-1' });
const receipt = {
  attemptId: '33333333-3333-4333-8333-333333333333', responseRevisionId: '44444444-4444-4444-8444-444444444444',
  answerRevision: 3, submittedAt: '2026-10-27T12:00:00.000Z', isLate: true,
};
const request = (body: unknown = input(), owner: string | null = learnerId) => new Request('http://localhost/api/learner/quiz/submissions', {
  method: 'POST', body: JSON.stringify(body), headers: owner ? { 'x-quiz-learner': owner } : {},
});
const expectPrivate = (response: Response) => expect(response.headers.get('cache-control')).toBe('private, no-store');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.learner.mockImplementation(async operation => ({ status: 'authorized', data: await operation({ submitQuiz: mocks.submit }, { id: learnerId }) }));
  mocks.submit.mockResolvedValue(receipt);
});

describe('learner quiz finalization HTTP boundary', () => {
  it('finalizes the exact saved revision and returns a durable receipt while score stays private', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(201); expectPrivate(response);
    const body = await response.json();
    expect(body).toEqual({ submission: receipt });
    for (const secret of ['earnedUnits', 'score', 'gradeRevisionId', 'correctOptionId', 'criterionScores', 'explanation', 'misconceptionTags', 'verificationJobId']) expect(JSON.stringify(body)).not.toContain(secret);
    expect(mocks.submit).toHaveBeenCalledWith({ recipientId, ...input() });
  });

  it('preserves the accepted attempt and response revision on a lost-response retry', async () => {
    const { POST } = await import('./route');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await POST(request(), context);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ submission: receipt });
    }
    expect(mocks.submit.mock.calls[0]).toEqual(mocks.submit.mock.calls[1]);
  });

  it('requires the current authenticated learner guard before parsing or finalization', async () => {
    const { POST } = await import('./route');
    for (const owner of [null, recipientId]) {
      const response = await POST(new Request('http://localhost', { method: 'POST', body: '{', headers: owner ? { 'x-quiz-learner': owner } : {} }), context);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'owner_changed' });
      expectPrivate(response);
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('denies missing authentication and role access before reading an invalid body', async () => {
    const { POST } = await import('./route');
    for (const [status, expected] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
      mocks.learner.mockResolvedValue({ status });
      const response = await POST(new Request('http://localhost', { method: 'POST', body: '{' }), context);
      expect(response.status).toBe(expected); expectPrivate(response);
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('validates the recipient route before authorization or receipt access', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), { params: Promise.resolve({ recipientId: 'bad-recipient' }) });
    expect(response.status).toBe(400); expectPrivate(response);
    expect(mocks.learner).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each([
    { answers: { 'fixture-map-position@1': 'prior' } }, { score: 250 }, { earnedUnits: 250 },
    { learnerId: recipientId }, { recipientId: learnerId }, { correctOptionId: 'prior' },
    { gradeRevisionId: learnerId }, { scoringVersion: 'client-scorer' }, { submittedAt: '2026-10-26T01:00:00Z' },
  ])('rejects inline answers, grade data, identity, or timing overrides: %j', async extra => {
    const { POST } = await import('./route');
    const response = await POST(request({ ...input(), ...extra }), context);
    expect(response.status).toBe(400); expectPrivate(response);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('rejects duplicate revision keys and oversized finalization envelopes', async () => {
    const { POST } = await import('./route');
    for (const [source, status] of [
      ['{"expectedRevision":2,"expectedRevision":3,"requestKey":"submit"}', 400],
      ['x'.repeat(4001), 413],
    ] as const) {
      const response = await POST(new Request('http://localhost', { method: 'POST', body: source, headers: { 'x-quiz-learner': learnerId } }), context);
      expect(response.status).toBe(status); expectPrivate(response);
    }
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('maps closed/access, stale/already-submitted, validation, and transaction failures safely', async () => {
    const { POST } = await import('./route');
    for (const [error, expected] of [
      [new QuizAssignmentAccessError(), 404], [new QuizAssignmentConflictError(4), 409],
      [new QuizAssignmentConflictError(3, 'submitted'), 409], [new QuizAssignmentValidationError(), 400],
      [new Error('private attempt/grade transaction detail'), 503],
    ] as const) {
      mocks.submit.mockRejectedValueOnce(error);
      const response = await POST(request(), context);
      expect(response.status).toBe(expected); expectPrivate(response);
      const body = await response.json();
      if (expected === 409) expect(body).toMatchObject({ code: 'quiz_conflict' });
      expect(JSON.stringify(body)).not.toContain('private attempt/grade transaction detail');
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuizAssignmentAccessError, QuizAssignmentConflictError, QuizAssignmentValidationError } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({ learner: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/quiz-assignment.server', () => ({ readQuizLearnerData: mocks.learner }));

const recipientId = '11111111-1111-4111-8111-111111111111';
const learnerId = '22222222-2222-4222-8222-222222222222';
const otherLearnerId = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ recipientId }) };
const input = () => ({ expectedRevision: 0, answers: { 'fixture-map-position@1': 'prior', 'fixture-window-boundary@1': null }, requestKey: 'save-quiz-1' });
const answerDraft = { revision: 1, answers: input().answers, updatedAt: '2026-10-27T12:00:00.000Z' };
const assignment = {
  recipientId, title: 'Fixture class quiz', instructions: 'Choose one.', maxUnits: 250,
  questions: [{ versionId: 'fixture-map-position@1', title: 'Map positions', prompt: 'Which positions are stored?', options: [{ id: 'prior', text: 'Earlier positions.' }, { id: 'current', text: 'Current position.' }], maxUnits: 250 }],
  answerDraft, submission: null, releasedGrade: null, isOpen: true, isClosed: false,
};
const request = (body: unknown = input(), owner: string | null = learnerId) => new Request('http://localhost/api/learner/quiz', {
  method: 'POST', body: JSON.stringify(body), headers: owner ? { 'x-quiz-learner': owner } : {},
});
const expectPrivate = (response: Response) => expect(response.headers.get('cache-control')).toBe('private, no-store');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.learner.mockImplementation(async operation => ({ status: 'authorized', data: await operation({ readLearnerQuiz: mocks.read, saveAnswers: mocks.save }, { id: learnerId }) }));
  mocks.read.mockResolvedValue(assignment);
  mocks.save.mockResolvedValue({ answerDraft, currentRevision: 1 });
});

describe('learner quiz read and answer-save HTTP boundary', () => {
  it('loads the recipient-owned safe assignment and authenticated account identity', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({ learnerId, assignment });
    expect(mocks.read).toHaveBeenCalledWith(recipientId);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('persists only answer selections, the acknowledged revision, and receipt key', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(await response.json()).toEqual({ answerDraft, currentRevision: 1 });
    expect(mocks.save).toHaveBeenCalledWith({ recipientId, ...input() });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('preserves an older accepted save receipt alongside the current server revision', async () => {
    mocks.save.mockResolvedValue({ answerDraft, currentRevision: 4 });
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(await response.json()).toEqual({ answerDraft, currentRevision: 4 });
    expect(mocks.save).toHaveBeenCalledWith({ recipientId, ...input() });
  });

  it('rejects missing/forged account guards before body decoding or answer access', async () => {
    const { POST } = await import('./route');
    for (const owner of [null, otherLearnerId]) {
      const response = await POST(new Request('http://localhost', { method: 'POST', body: '{', headers: owner ? { 'x-quiz-learner': owner } : {} }), context);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'owner_changed' });
      expectPrivate(response);
    }
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('denies unauthorized callers before reading malformed request bodies', async () => {
    const { GET, POST } = await import('./route');
    for (const [status, expected] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
      mocks.learner.mockResolvedValue({ status });
      const read = await GET(new Request('http://localhost'), context);
      const write = await POST(new Request('http://localhost', { method: 'POST', body: '{' }), context);
      expect(read.status).toBe(expected); expect(write.status).toBe(expected);
      expectPrivate(read); expectPrivate(write);
    }
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });

  it('rejects invalid recipient parameters before invoking authorization', async () => {
    const { GET, POST } = await import('./route');
    const bad = { params: Promise.resolve({ recipientId: 'another-user' }) };
    expect((await GET(new Request('http://localhost'), bad)).status).toBe(400);
    expect((await POST(request(), bad)).status).toBe(400);
    expect(mocks.learner).not.toHaveBeenCalled();
  });

  it.each([
    { score: 250 }, { earnedUnits: 250 }, { learnerId: otherLearnerId }, { recipientId: otherLearnerId },
    { correctOptionId: 'prior' }, { policyVersionId: otherLearnerId }, { evaluatorVersionId: 'client-scorer' },
  ])('rejects forged grade, identity, and scoring metadata: %j', async extra => {
    const { POST } = await import('./route');
    const response = await POST(request({ ...input(), ...extra }), context);
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('rejects repeated answer properties rather than accepting the last option silently', async () => {
    const { POST } = await import('./route');
    const source = '{"expectedRevision":0,"requestKey":"save","answers":{"fixture-map-position@1":"prior","fixture-map-position@1":"current"}}';
    const response = await POST(new Request('http://localhost', { method: 'POST', body: source, headers: { 'x-quiz-learner': learnerId } }), context);
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('enforces the smaller answer-save body limit without trusting content length', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', {
      method: 'POST', body: 'x'.repeat(16_001), headers: { 'x-quiz-learner': learnerId, 'content-length': '1' },
    }), context);
    expect(response.status).toBe(413);
    expectPrivate(response);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('maps access, revision/finalization conflict, option validation, and private failures', async () => {
    const { POST } = await import('./route');
    for (const [error, expected] of [
      [new QuizAssignmentAccessError(), 404], [new QuizAssignmentConflictError(3), 409],
      [new QuizAssignmentValidationError('Choose an option from this assigned quiz.'), 400],
      [new Error('private frozen answer-key SQL detail'), 503],
    ] as const) {
      mocks.save.mockRejectedValueOnce(error);
      const response = await POST(request(), context);
      expect(response.status).toBe(expected); expectPrivate(response);
      const body = await response.json();
      if (expected === 409) expect(body).toMatchObject({ code: 'quiz_conflict' });
      expect(JSON.stringify(body)).not.toContain('private frozen answer-key SQL detail');
    }
  });

  it('returns an indistinguishable safe not-found result for unreadable recipient quizzes', async () => {
    mocks.read.mockRejectedValue(new QuizAssignmentAccessError());
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), context);
    expect(response.status).toBe(404); expectPrivate(response);
    expect(await response.json()).toEqual({ error: 'Quiz not found or not available.' });
  });
});

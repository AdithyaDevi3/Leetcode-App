import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeQuestionVersion } from '@leetcode-app/domain';
import { QuizAssignmentAccessError, QuizAssignmentConflictError, QuizAssignmentValidationError } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({ author: vi.fn(), read: vi.fn(), publish: vi.fn(), question: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/quiz-assignment.server', () => ({ readQuizAuthorData: mocks.author }));
vi.mock('@/lib/question-bank.server', () => ({ getReviewedQuestionVersion: mocks.question }));

const draftId = '11111111-1111-4111-8111-111111111111';
const classId = '22222222-2222-4222-8222-222222222222';
const authorId = '33333333-3333-4333-8333-333333333333';
const learnerId = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ draftId }) };
const question = freezeQuestionVersion({
  questionId: 'fixture-map-position', version: 1, versionId: 'fixture-map-position@1', kind: 'multiple_choice', status: 'reviewed',
  title: 'Map positions', prompt: 'Which positions can already be in the map?', difficulty: 'foundation',
  activityIds: ['pair-with-target-v1'], conceptIds: ['map-invariant'],
  options: [{ id: 'prior', text: 'Earlier positions only.', misconceptionTags: [] }, { id: 'current', text: 'The current position too.', misconceptionTags: ['fixture-self-match'] }],
  correctOptionId: 'prior', explanation: 'Private fixture solution explanation.',
  provenance: { kind: 'original', authorId: 'private-fixture-author', authoredAt: '2026-10-25T00:00:00.000Z' },
  review: { reviewerId: 'private-fixture-reviewer', reviewedAt: '2026-10-26T00:00:00.000Z', notes: 'Teacher validation pending.' },
});
const draft = () => ({
  id: draftId, classId, revision: 2, title: 'Map quiz', instructions: 'Choose one.',
  questions: [{ questionVersionId: question.versionId, maxUnits: 250 }], maxUnits: 250,
  availableAt: null, dueAt: null, closesAt: null, status: 'draft', createdBy: authorId,
  createdAt: '2026-10-27T09:00:00.000Z', updatedAt: '2026-10-27T09:00:00.000Z',
});
const publication = { id: '55555555-5555-4555-8555-555555555555', draftId, classId, recipientCount: 1 };
const input = () => ({
  expectedRevision: 2, expectedRosterFingerprint: 'a'.repeat(64), requestKey: 'publish-map-quiz',
  audience: { kind: 'class', learnerIds: [learnerId] },
});
const request = (body: unknown = input(), workspace: string | null = 'teach', owner: string | null = authorId) => new Request(
  `http://localhost/api/assessments/drafts/${draftId}/publications${workspace ? `?workspace=${workspace}` : ''}`,
  { method: 'POST', body: JSON.stringify(body), headers: owner ? { 'x-assessment-author': owner } : {} },
);
const readContext = () => ({
  draft: draft(), learners: [{ id: learnerId, displayName: 'Fixture learner', email: 'private-fixture@example.invalid' }],
  rosterFingerprint: 'a'.repeat(64), publication: null as unknown,
});
const expectPrivate = (response: Response) => expect(response.headers.get('cache-control')).toBe('private, no-store');
const expectNoKey = (value: unknown) => {
  const encoded = JSON.stringify(value);
  for (const secret of ['correctOptionId', 'Private fixture solution', 'private-fixture-author', 'private-fixture-reviewer', 'fixture-self-match', 'misconceptionTags']) expect(encoded).not.toContain(secret);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.author.mockImplementation(async (_workspace, operation) => ({ status: 'authorized', data: await operation({ readAuthorDraft: mocks.read, publishDraft: mocks.publish }, { id: authorId }) }));
  mocks.read.mockResolvedValue(readContext());
  mocks.publish.mockResolvedValue(publication);
  mocks.question.mockImplementation(id => id === question.versionId ? question : null);
});

describe('class quiz publication HTTP boundary', () => {
  it('returns a minimal author roster through explicit admin and instructor workspaces', async () => {
    const { GET } = await import('./route');
    for (const workspace of ['admin', 'teach']) {
      const response = await GET(new Request(`http://localhost?workspace=${workspace}`), context);
      expect(response.status).toBe(200);
      expectPrivate(response);
      const body = await response.json();
      expect(body.learners).toEqual([{ id: learnerId, displayName: 'Fixture learner' }]);
      expect(JSON.stringify(body)).not.toContain('private-fixture@example.invalid');
      expectNoKey(body);
      expect(mocks.author).toHaveBeenLastCalledWith(workspace, expect.any(Function));
    }
    expect(mocks.question).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('freezes server-owned reviewed questions and points from the saved draft', async () => {
    const { POST } = await import('./route');
    for (const workspace of ['admin', 'teach']) {
      const response = await POST(request(input(), workspace), context);
      expect(response.status).toBe(201);
      expectPrivate(response);
      const body = await response.json();
      expect(body).toEqual({ publication });
      expectNoKey(body);
      expect(mocks.publish).toHaveBeenLastCalledWith(expect.objectContaining({
        ...input(), draftId, reason: 'Author assigned a saved class quiz',
        snapshot: expect.objectContaining({ questions: [{ question, maxUnits: 250 }] }),
      }));
    }
  });

  it('passes selected audience and its exact roster fingerprint without widening membership', async () => {
    const { POST } = await import('./route');
    const selected = { ...input(), audience: { kind: 'selected', learnerIds: [learnerId] } };
    expect((await POST(request(selected), context)).status).toBe(201);
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining(selected));
  });

  it('replays an accepted publication after later draft/catalog changes without resolving new answers', async () => {
    mocks.read.mockResolvedValue({ ...readContext(), draft: { ...draft(), revision: 8, questions: [{ questionVersionId: 'removed-question@9', maxUnits: 999 }] }, publication });
    mocks.question.mockImplementation(() => { throw new Error('The current catalog must not affect an accepted receipt'); });
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ publication });
    expect(mocks.question).not.toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2, requestKey: input().requestKey, draftId }));
    expect(mocks.publish.mock.calls[0][0].snapshot).toBeUndefined();
  });

  it('rejects a missing or changed owner before decoding or reading the draft', async () => {
    const { POST } = await import('./route');
    for (const owner of [null, learnerId]) {
      const response = await POST(new Request('http://localhost?workspace=teach', { method: 'POST', body: '{', headers: owner ? { 'x-assessment-author': owner } : {} }), context);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'owner_changed' });
      expectPrivate(response);
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.question).not.toHaveBeenCalled();
  });

  it('denies unauthenticated or forbidden authors before parsing malformed bodies', async () => {
    const { GET, POST } = await import('./route');
    for (const [status, expected] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
      mocks.author.mockResolvedValue({ status });
      const write = await POST(new Request('http://localhost?workspace=admin', { method: 'POST', body: '{' }), context);
      const read = await GET(new Request('http://localhost?workspace=admin'), context);
      expect(write.status).toBe(expected); expect(read.status).toBe(expected);
      expectPrivate(write); expectPrivate(read);
    }
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('validates route identity and workspace before authorization', async () => {
    const { GET, POST } = await import('./route');
    for (const workspace of [null, 'learner']) expect((await POST(request(input(), workspace), context)).status).toBe(400);
    const bad = { params: Promise.resolve({ draftId: 'bad-draft' }) };
    expect((await POST(request(), bad)).status).toBe(400);
    expect((await GET(new Request('http://localhost?workspace=teach'), bad)).status).toBe(400);
    expect(mocks.author).not.toHaveBeenCalled();
  });

  it('rejects duplicate and forged scoring fields before reading questions or publishing', async () => {
    const { POST } = await import('./route');
    for (const extra of [{ snapshot: { answerKey: 'prior' } }, { expectedAuthor: authorId }, { maxUnits: 999 }, { learnerId }]) {
      const response = await POST(request({ ...input(), ...extra }), context);
      expect(response.status).toBe(400);
      expectPrivate(response);
    }
    const duplicate = JSON.stringify(input()).replace('"expectedRevision":2', '"expectedRevision":2,"expectedRevision":3');
    expect((await POST(new Request('http://localhost?workspace=teach', { method: 'POST', body: duplicate, headers: { 'x-assessment-author': authorId } }), context)).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.question).not.toHaveBeenCalled();
  });

  it('rejects an unavailable reviewed version without publishing partial work', async () => {
    mocks.question.mockReturnValue(null);
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(400);
    expectPrivate(response);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('maps revoked access, roster/revision conflict, validation, and private failure safely', async () => {
    const { POST } = await import('./route');
    for (const [error, expected] of [
      [new QuizAssignmentAccessError(), 404], [new QuizAssignmentConflictError(), 409],
      [new QuizAssignmentValidationError('Choose an enrolled audience.'), 400],
      [new Error('private quiz snapshot or SQL detail'), 503],
    ] as const) {
      mocks.publish.mockRejectedValueOnce(error);
      const response = await POST(request(), context);
      expect(response.status).toBe(expected);
      expectPrivate(response);
      const body = await response.json();
      if (expected === 409) expect(body).toMatchObject({ code: 'quiz_conflict' });
      expect(JSON.stringify(body)).not.toContain('private quiz snapshot or SQL detail');
      expectNoKey(body);
    }
  });
});

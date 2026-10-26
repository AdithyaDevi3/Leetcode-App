import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeQuestionVersion } from '@leetcode-app/domain';
import { AssessmentDraftAccessError, AssessmentDraftConflictError, AssessmentDraftValidationError } from '@leetcode-app/database';
import { requestIdHeader } from '@/lib/request-correlation';

const mocks = vi.hoisted(() => ({ author: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), get: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/assessment-author', () => ({ readAssessmentAuthorData: mocks.author }));
vi.mock('@/lib/question-bank.server', () => ({ getReviewedQuestionVersion: mocks.find }));

const classId = '11111111-1111-4111-8111-111111111111';
const draftId = '22222222-2222-4222-8222-222222222222';
const authorId = '44444444-4444-4444-8444-444444444444';
const privateQuestion = freezeQuestionVersion({
  questionId: 'fixture-map-position', version: 1, versionId: 'fixture-map-position@1', kind: 'multiple_choice', status: 'reviewed',
  title: 'Choose the map invariant', prompt: 'Which positions can already be in the map?', difficulty: 'foundation',
  activityIds: ['pair-with-target-v1'], conceptIds: ['map-invariant'],
  options: [{ id: 'prior', text: 'Earlier positions only.', misconceptionTags: [] }, { id: 'all', text: 'All positions including this one.', misconceptionTags: ['self-match'] }],
  correctOptionId: 'prior', explanation: 'Private answer explanation.',
  provenance: { kind: 'original', authorId: 'private-fixture-author', authoredAt: '2026-10-25T00:00:00.000Z' },
  review: { reviewerId: 'private-fixture-reviewer', reviewedAt: '2026-10-26T00:00:00.000Z', notes: 'Synthetic fixture review only.' },
});
const input = () => ({
  requestKey: 'save-quiz-draft-1', draftId: null as string | null, expectedRevision: null as number | null,
  draft: { classId, title: 'A class quiz', instructions: 'Choose one option.', questions: [{ questionVersionId: privateQuestion.versionId, maxUnits: 250 }], availableAt: null, dueAt: null, closesAt: null },
});
const stored = () => ({ ...input().draft, id: draftId, revision: 1, maxUnits: 250, status: 'draft', createdBy: authorId, createdAt: '2026-10-26T09:00:00.000Z', updatedAt: '2026-10-26T09:00:00.000Z' });
const request = (body: unknown = input(), workspace = 'teach', expectedAuthor: string | null = authorId) => new Request(`http://localhost/api/assessments/drafts?workspace=${workspace}`, {
  method: 'POST', headers: { [requestIdHeader]: 'synthetic-http-request', ...(expectedAuthor ? { 'x-assessment-author': expectedAuthor } : {}) }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockImplementation(id => id === privateQuestion.versionId ? privateQuestion : null);
  mocks.create.mockResolvedValue(stored()); mocks.update.mockImplementation(async () => {
    const saved = { ...stored(), revision: 2 };
    mocks.get.mockResolvedValue(saved);
    return saved;
  });
  mocks.get.mockResolvedValue(stored()); mocks.list.mockResolvedValue([stored()]);
  mocks.author.mockImplementation(async (_workspace, read) => ({ status: 'authorized', data: await read({ createDraft: mocks.create, updateDraft: mocks.update, getDraft: mocks.get, listDrafts: mocks.list }, {}, { id: authorId }) }));
});

describe('assessment draft HTTP boundary', () => {
  it('creates a safe private draft through the chosen instructor or admin boundary', async () => {
    const { POST } = await import('./route');
    for (const workspace of ['teach', 'admin']) {
      const response = await POST(request(input(), workspace));
      expect(response.status).toBe(201);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const body = await response.json();
      expect(body).toEqual({ draft: stored(), currentRevision: 1 });
      for (const secret of ['correctOptionId', 'Private answer explanation', 'private-fixture-author', 'private-fixture-reviewer', 'misconceptionTags']) expect(JSON.stringify(body)).not.toContain(secret);
      expect(mocks.author).toHaveBeenLastCalledWith(workspace, expect.any(Function));
    }
    expect(mocks.create).toHaveBeenCalledWith({ draft: input().draft, requestKey: 'save-quiz-draft-1', reason: 'Author created a class quiz draft', requestId: 'synthetic-http-request' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('passes the exact saved revision and stable request key to updates', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ ...input(), draftId, expectedRevision: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ draft: { id: draftId, revision: 2 } });
    expect(mocks.update).toHaveBeenCalledWith({ draftId, expectedRevision: 1, draft: input().draft, requestKey: 'save-quiz-draft-1', reason: 'Author updated a class quiz draft', requestId: 'synthetic-http-request' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('reports a newer current revision alongside an older recovered receipt', async () => {
    mocks.update.mockResolvedValueOnce({ ...stored(), revision: 2 });
    mocks.get.mockResolvedValueOnce({ ...stored(), revision: 4, title: 'Updated on another device' });
    const { POST } = await import('./route');
    const response = await POST(request({ ...input(), draftId, expectedRevision: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ draft: { id: draftId, revision: 2 }, currentRevision: 4 });
    expect(mocks.get).toHaveBeenCalledWith(draftId);
  });

  it('rejects missing or changed author identity before any draft mutation', async () => {
    const { POST } = await import('./route');
    for (const workspace of ['teach', 'admin']) {
      for (const expectedAuthor of [null, '55555555-5555-4555-8555-555555555555']) {
        const response = await POST(request(input(), workspace, expectedAuthor));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 'owner_changed' });
      }
    }
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled();
  });

  it('lists or reads owned drafts without invoking the answer catalog', async () => {
    const { GET } = await import('./route');
    const list = await GET(new Request(`http://localhost/api/assessments/drafts?workspace=teach&classId=${classId}`));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ drafts: [stored()] });
    expect(mocks.list).toHaveBeenCalledWith(classId);
    const read = await GET(new Request(`http://localhost/api/assessments/drafts?workspace=admin&draftId=${draftId}`));
    expect(await read.json()).toEqual({ draft: stored() });
    expect(mocks.get).toHaveBeenCalledWith(draftId);
    expect(mocks.find).not.toHaveBeenCalled();
    expect(read.headers.get('cache-control')).toBe('private, no-store');
  });

  it('denies unauthenticated and forbidden callers before any repository access', async () => {
    const { GET, POST } = await import('./route');
    for (const [status, code] of [['unauthenticated', 401], ['forbidden', 403]] as const) {
      mocks.author.mockResolvedValue({ status });
      expect((await POST(request())).status).toBe(code);
      expect((await GET(new Request(`http://localhost/api/assessments/drafts?workspace=teach&classId=${classId}`))).status).toBe(code);
    }
    for (const method of [mocks.create, mocks.update, mocks.get, mocks.list]) expect(method).not.toHaveBeenCalled();
  });

  it('requires an explicit valid workspace and valid lookup identifiers', async () => {
    const { GET, POST } = await import('./route');
    expect((await POST(request(input(), 'learner'))).status).toBe(400);
    expect((await GET(new Request(`http://localhost/api/assessments/drafts?classId=${classId}`))).status).toBe(400);
    expect((await GET(new Request('http://localhost/api/assessments/drafts?workspace=teach&draftId=bad-id'))).status).toBe(400);
    expect(mocks.author).not.toHaveBeenCalled();
  });

  it('rejects malformed, oversized, unknown-version, and answer-bearing requests before writes', async () => {
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost/api/assessments/drafts?workspace=teach', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await POST(new Request('http://localhost/api/assessments/drafts?workspace=teach', { method: 'POST', body: 'x'.repeat(30_001) }))).status).toBe(413);
    expect((await POST(request({ ...input(), draft: { ...input().draft, questions: [{ questionVersionId: 'fixture-map-position@999', maxUnits: 100 }] } }))).status).toBe(400);
    expect((await POST(request({ ...input(), draft: { ...input().draft, questions: [{ ...input().draft.questions[0], correctOptionId: 'prior' }] } }))).status).toBe(400);
    expect(mocks.author).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns recoverable conflict/access/validation errors and does not expose underlying failures', async () => {
    const { POST } = await import('./route');
    for (const [error, status] of [[new AssessmentDraftConflictError(3), 409], [new AssessmentDraftAccessError(), 404], [new AssessmentDraftValidationError('Choose valid points.'), 400], [new Error('private database detail'), 503]] as const) {
      mocks.create.mockRejectedValueOnce(error);
      const response = await POST(request());
      expect(response.status).toBe(status);
      const body = await response.json();
      if (status === 409) expect(body).toMatchObject({ code: 'draft_conflict', error: expect.stringContaining('entries are preserved') });
      expect(JSON.stringify(body)).not.toContain('private database detail');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });
});

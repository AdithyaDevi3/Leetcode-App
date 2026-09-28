import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendGrade = vi.fn();
const withInstructorGradebook = vi.fn(async (operation: (repository: { appendGrade: typeof appendGrade }) => unknown) => operation({ appendGrade }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instructor-gradebook')>();
  return { ...original, withInstructorGradebook };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ recipientId }) };
const request = (body: unknown) => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) });

describe('manual draft grade route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts an exact rubric draft and supplies a trusted audit reason', async () => {
    appendGrade.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', sequence: 1 });
    const { PUT } = await import('./route');
    const response = await PUT(request({ attemptId, expectedGradeRevisionId: null, criterionScores: { approach: 4 }, learnerFeedback: 'Clear work.', privateNote: 'Follow up later.', requestKey: 'draft-1' }), context);
    expect(response.status).toBe(201);
    expect(appendGrade).toHaveBeenCalledWith(expect.objectContaining({
      recipientId, attemptId, kind: 'scored', reason: 'Instructor saved a manual grade draft',
      learnerFeedback: 'Clear work.', privateNote: 'Follow up later.',
    }));
  });

  it.each([
    { attemptId, expectedGradeRevisionId: null, criterionScores: { approach: 4 }, learnerFeedback: '', privateNote: '', requestKey: 'x', extra: true },
    { attemptId: 'bad', expectedGradeRevisionId: null, criterionScores: {}, learnerFeedback: '', privateNote: '', requestKey: 'x' },
    { attemptId, expectedGradeRevisionId: null, criterionScores: { approach: 1.5 }, learnerFeedback: '', privateNote: '', requestKey: 'x' },
  ])('rejects malformed or over-posted input before repository access', async body => {
    const { PUT } = await import('./route');
    const response = await PUT(request(body), context);
    expect(response.status).toBe(400);
    expect(appendGrade).not.toHaveBeenCalled();
  });
});

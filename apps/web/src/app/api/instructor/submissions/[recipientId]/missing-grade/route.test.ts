import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendGrade = vi.fn();
const withInstructorGradebook = vi.fn(async (operation: (repository: { appendGrade: typeof appendGrade }) => unknown) => operation({ appendGrade }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instructor-gradebook')>();
  return { ...original, withInstructorGradebook };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ recipientId }) };

describe('missing-work grade route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an attributable missing-work draft without accepting a score', async () => {
    appendGrade.mockResolvedValue({ id: '22222222-2222-4222-8222-222222222222', kind: 'missing_zero', earnedUnits: 0 });
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ expectedGradeRevisionId: null, requestKey: 'missing-1' }) }), context);
    expect(response.status).toBe(201);
    expect(appendGrade).toHaveBeenCalledWith(expect.objectContaining({ recipientId, attemptId: null, kind: 'missing_zero', criterionScores: {}, reason: expect.stringContaining('assignment closed') }));
  });

  it('rejects over-posted scores before repository access', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ expectedGradeRevisionId: null, requestKey: 'missing-1', score: 0 }) }), context);
    expect(response.status).toBe(400);
    expect(appendGrade).not.toHaveBeenCalled();
  });
});

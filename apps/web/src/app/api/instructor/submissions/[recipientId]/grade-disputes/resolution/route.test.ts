import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveGradeDispute = vi.fn();
const withInstructorGradebook = vi.fn(async (operation: (repository: { resolveGradeDispute: typeof resolveGradeDispute }) => unknown) => operation({ resolveGradeDispute }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instructor-gradebook')>();
  return { ...original, withInstructorGradebook };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const gradeId = '33333333-3333-4333-8333-333333333333';
const context = { params: Promise.resolve({ recipientId }) };

describe('instructor dispute resolution route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upholds the published grade with an attributable explanation', async () => {
    resolveGradeDispute.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444', status: 'resolved' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      expectedDisputeEventId: eventId, outcome: 'upheld', replacementGradeRevisionId: null,
      reason: 'The rubric was applied as published.', requestKey: 'resolve-1',
    }) }), context);
    expect(response.status).toBe(200);
    expect(resolveGradeDispute).toHaveBeenCalledWith({ recipientId, expectedDisputeEventId: eventId,
      outcome: 'upheld', replacementGradeRevisionId: null, reason: 'The rubric was applied as published.', requestKey: 'resolve-1' });
  });

  it('requires a replacement revision for a changed outcome', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      expectedDisputeEventId: eventId, outcome: 'changed', replacementGradeRevisionId: null,
      reason: 'Score corrected.', requestKey: 'resolve-2',
    }) }), context);
    expect(response.status).toBe(400);
    expect(resolveGradeDispute).not.toHaveBeenCalled();
  });

  it('passes a changed outcome with its already-published replacement revision', async () => {
    const { POST } = await import('./route');
    await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      expectedDisputeEventId: eventId, outcome: 'changed', replacementGradeRevisionId: gradeId,
      reason: 'Score corrected and republished.', requestKey: 'resolve-3',
    }) }), context);
    expect(resolveGradeDispute).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'changed', replacementGradeRevisionId: gradeId }));
  });
});

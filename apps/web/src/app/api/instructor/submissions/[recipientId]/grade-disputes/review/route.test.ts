import { beforeEach, describe, expect, it, vi } from 'vitest';

const markGradeDisputeInReview = vi.fn();
const withInstructorGradebook = vi.fn(async (operation: (repository: { markGradeDisputeInReview: typeof markGradeDisputeInReview }) => unknown) => operation({ markGradeDisputeInReview }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instructor-gradebook')>();
  return { ...original, withInstructorGradebook };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ recipientId }) };

describe('instructor dispute review route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks the current learner request in review', async () => {
    markGradeDisputeInReview.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', status: 'in_review' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      expectedDisputeEventId: eventId, reason: 'Review assigned to instructor', requestKey: 'review-1',
    }) }), context);
    expect(response.status).toBe(200);
    expect(markGradeDisputeInReview).toHaveBeenCalledWith({ recipientId, expectedDisputeEventId: eventId,
      reason: 'Review assigned to instructor', requestKey: 'review-1' });
  });

  it('rejects extra fields and blank reasons', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({
      expectedDisputeEventId: eventId, reason: ' ', requestKey: 'review-2', actorId: 'forged',
    }) }), context);
    expect(response.status).toBe(400);
    expect(markGradeDisputeInReview).not.toHaveBeenCalled();
  });
});

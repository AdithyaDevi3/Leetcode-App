import { beforeEach, describe, expect, it, vi } from 'vitest';

const setRecipientApplicability = vi.fn();
const withInstructorGradebook = vi.fn(async (operation: (repository: { setRecipientApplicability: typeof setRecipientApplicability }) => unknown) => operation({ setRecipientApplicability }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/instructor-gradebook')>();
  return { ...original, withInstructorGradebook };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const revisionId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ recipientId }) };

describe('recipient applicability route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records an instructor excusal against the current revision', async () => {
    setRecipientApplicability.mockResolvedValue({ id: '33333333-3333-4333-8333-333333333333', applicability: 'excused' });
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({
      expectedApplicabilityRevisionId: revisionId, applicability: 'excused', reason: 'Approved absence', requestKey: 'excuse-1',
    }) }), context);
    expect(response.status).toBe(200);
    expect(setRecipientApplicability).toHaveBeenCalledWith({ recipientId, expectedApplicabilityRevisionId: revisionId, applicability: 'excused', reason: 'Approved absence', requestKey: 'excuse-1' });
  });

  it('rejects unsupported states and extra fields before repository access', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({
      expectedApplicabilityRevisionId: revisionId, applicability: 'deleted', reason: 'No longer assigned', requestKey: 'bad-1', score: 0,
    }) }), context);
    expect(response.status).toBe(400);
    expect(setRecipientApplicability).not.toHaveBeenCalled();
  });

  it('requires an attributable reason', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({
      expectedApplicabilityRevisionId: revisionId, applicability: 'excused', reason: ' ', requestKey: 'bad-2',
    }) }), context);
    expect(response.status).toBe(400);
    expect(setRecipientApplicability).not.toHaveBeenCalled();
  });
});

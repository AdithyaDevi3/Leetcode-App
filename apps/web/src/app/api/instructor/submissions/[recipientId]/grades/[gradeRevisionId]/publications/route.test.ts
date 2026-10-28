import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradebookAccessError, GradebookConflictError } from '@leetcode-app/database';

const mocks = vi.hoisted(() => ({ publish: vi.fn(), authorize: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/instructor-gradebook', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/instructor-gradebook')>(),
  withInstructorGradebook: mocks.authorize,
}));

const recipientId = '11111111-1111-4111-8111-111111111111';
const gradeRevisionId = '22222222-2222-4222-8222-222222222222';
const instructorId = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ recipientId, gradeRevisionId }) };
const accepted = {
  id: '33333333-3333-4333-8333-333333333333', recipientId, gradeRevisionId,
  sequence: 1, publishedAt: '2026-10-27T12:00:00.000Z',
};
const body = () => ({ expectedPublicationSequence: 0, requestKey: 'release-quiz-1' });
const request = (value: unknown = body()) => new Request('http://localhost/api/instructor/publications', {
  method: 'POST', body: JSON.stringify(value),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockImplementation(operation => operation({ publishGrade: mocks.publish }, { id: instructorId }));
  mocks.publish.mockResolvedValue(accepted);
});

describe('instructor grade release HTTP boundary', () => {
  it('releases the stored grade identified by the route without accepting calculated points', async () => {
    const { POST } = await import('./route');
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ publication: accepted });
    expect(mocks.publish).toHaveBeenCalledWith({
      recipientId, gradeRevisionId, expectedPublicationSequence: 0, requestKey: 'release-quiz-1',
      reason: expect.stringMatching(/Instructor published/),
    });
  });

  it('returns the original persisted publication on a lost-response retry', async () => {
    const { POST } = await import('./route');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await POST(request(), context);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ publication: accepted });
    }
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.publish.mock.calls[0]).toEqual(mocks.publish.mock.calls[1]);
  });

  it('accepts a matching optional account guard and blocks a changed instructor', async () => {
    const { POST } = await import('./route');
    for (const [owner, status] of [[instructorId, 201], [recipientId, 409]] as const) {
      const response = await POST(new Request('http://localhost', {
        method: 'POST', body: JSON.stringify(body()), headers: { 'x-assessment-author': owner },
      }), context);
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(mocks.publish).toHaveBeenCalledOnce();
  });

  it('rejects duplicate JSON properties and oversized release requests', async () => {
    const { POST } = await import('./route');
    for (const [source, status] of [
      ['{"expectedPublicationSequence":0,"expectedPublicationSequence":1,"requestKey":"release"}', 400],
      ['x'.repeat(4001), 413],
    ] as const) {
      const response = await POST(new Request('http://localhost', { method: 'POST', body: source }), context);
      expect(response.status).toBe(status);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each([
    { earnedUnits: 100 }, { score: 100 }, { correctOptionId: 'a' }, { criterionScores: { q1: 100 } },
    { learnerId: recipientId }, { publishedBy: recipientId }, { gradeRevisionId: recipientId },
    { reason: 'Client claims this grade was reviewed' },
  ])('rejects forged score, identity, answer key, or audit fields: %j', async extra => {
    const { POST } = await import('./route');
    const response = await POST(request({ ...body(), ...extra }), context);
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each([null, [], {},
    { ...body(), expectedPublicationSequence: -1 }, { ...body(), expectedPublicationSequence: 0.5 },
    { ...body(), expectedPublicationSequence: '0' }, { ...body(), expectedPublicationSequence: Number.MAX_SAFE_INTEGER + 1 },
    { ...body(), requestKey: '' }, { ...body(), requestKey: 'x'.repeat(129) },
  ])('rejects malformed publication envelopes: %j', async value => {
    const { POST } = await import('./route');
    const response = await POST(request(value), context);
    expect(response.status).toBe(400);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON without invoking the authorization or persistence boundary', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{' }), context);
    expect(response.status).toBe(400);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('preserves access and concurrency failures without exposing internal details', async () => {
    const { POST } = await import('./route');
    for (const [error, status] of [
      [new GradebookAccessError(), 404], [new GradebookConflictError(), 409],
      [new Error('private SQL connection detail'), 500],
    ] as const) {
      mocks.publish.mockRejectedValueOnce(error);
      const response = await POST(request(), context);
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain('private SQL connection detail');
    }
  });

  it('does not let unauthenticated or inactive-role callers reach grade publication', async () => {
    const { POST } = await import('./route');
    const { InstructorGradebookAuthError } = await import('@/lib/instructor-gradebook');
    for (const status of [401, 403] as const) {
      mocks.authorize.mockRejectedValueOnce(new InstructorGradebookAuthError(status));
      expect((await POST(request(), context)).status).toBe(status);
    }
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

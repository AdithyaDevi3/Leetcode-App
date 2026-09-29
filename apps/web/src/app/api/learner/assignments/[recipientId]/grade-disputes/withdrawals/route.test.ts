import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradebookConflictError } from '@leetcode-app/database';

const requireAuth = vi.fn();
const withdrawGradeDispute = vi.fn();
const close = vi.fn();
const repositoryConstructor = vi.fn();

vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@leetcode-app/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@leetcode-app/database')>();
  return {
    ...original,
    databaseConfigFromEnv: vi.fn(() => ({})),
    createDatabaseClient: vi.fn(() => ({ close })),
    PostgresGradebookRepository: class {
      withdrawGradeDispute = withdrawGradeDispute;
      constructor(...args: unknown[]) { repositoryConstructor(...args); }
    },
  };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const learnerId = '22222222-2222-4222-8222-222222222222';
const expectedDisputeEventId = '33333333-3333-4333-8333-333333333333';
const request = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const context = { params: Promise.resolve({ recipientId }) };
const validBody = { expectedDisputeEventId, requestKey: 'withdraw-1' };

describe('POST /api/learner/assignments/[recipientId]/grade-disputes/withdrawals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: learnerId } });
  });

  it('withdraws the current dispute as the authenticated learner', async () => {
    const dispute = { id: '44444444-4444-4444-8444-444444444444', status: 'withdrawn' };
    withdrawGradeDispute.mockResolvedValue(dispute);
    const { POST } = await import('./route');
    const response = await POST(request(validBody), context);
    expect(response.status).toBe(201);
    expect(repositoryConstructor).toHaveBeenCalledWith(expect.anything(), { role: 'learner', userId: learnerId });
    expect(withdrawGradeDispute).toHaveBeenCalledWith({ recipientId, ...validBody });
    expect(await response.json()).toEqual({ dispute });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    { ...validBody, classId: recipientId },
    { ...validBody, expectedDisputeEventId: null },
    { expectedDisputeEventId },
  ])('rejects a non-exact or malformed body', async body => {
    const { POST } = await import('./route');
    const response = await POST(request(body), context);
    expect(response.status).toBe(400);
    expect(withdrawGradeDispute).not.toHaveBeenCalled();
  });

  it('returns 401 without opening a database connection', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized: Authentication required'));
    const { POST } = await import('./route');
    const response = await POST(request(validBody), context);
    expect(response.status).toBe(401);
    expect(close).not.toHaveBeenCalled();
  });

  it('returns a stable conflict response', async () => {
    withdrawGradeDispute.mockRejectedValue(new GradebookConflictError());
    const { POST } = await import('./route');
    const response = await POST(request(validBody), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Grade dispute changed; refresh and try again' });
  });
});

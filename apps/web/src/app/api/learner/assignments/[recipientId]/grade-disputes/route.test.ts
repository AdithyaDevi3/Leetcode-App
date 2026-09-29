import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradebookAccessError, GradebookConflictError } from '@leetcode-app/database';

const requireAuth = vi.fn();
const openGradeDispute = vi.fn();
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
      openGradeDispute = openGradeDispute;
      constructor(...args: unknown[]) { repositoryConstructor(...args); }
    },
  };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const learnerId = '22222222-2222-4222-8222-222222222222';
const gradeRevisionId = '33333333-3333-4333-8333-333333333333';
const request = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const context = { params: Promise.resolve({ recipientId }) };
const validBody = { expectedDisputeEventId: null, gradeRevisionId, reason: 'The rubric did not credit my explanation.', requestKey: 'dispute-1' };

describe('POST /api/learner/assignments/[recipientId]/grade-disputes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: learnerId } });
  });

  it('opens a dispute using only the authenticated learner identity', async () => {
    const dispute = { id: '44444444-4444-4444-8444-444444444444', status: 'submitted' };
    openGradeDispute.mockResolvedValue(dispute);
    const { POST } = await import('./route');
    const response = await POST(request(validBody), context);
    expect(response.status).toBe(201);
    expect(repositoryConstructor).toHaveBeenCalledWith(expect.anything(), { role: 'learner', userId: learnerId });
    expect(openGradeDispute).toHaveBeenCalledWith({ recipientId, ...validBody });
    expect(await response.json()).toEqual({ dispute });
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    { ...validBody, learnerId },
    { ...validBody, gradeRevisionId: 'invalid' },
    { ...validBody, reason: ' ' },
    { ...validBody, reason: 'Too short' },
    { expectedDisputeEventId: null, gradeRevisionId, reason: validBody.reason },
  ])('rejects a non-exact or malformed body before opening the database', async body => {
    const { POST } = await import('./route');
    const response = await POST(request(body), context);
    expect(response.status).toBe(400);
    expect(openGradeDispute).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    [new Error('Unauthorized: Authentication required'), 401],
    [new GradebookAccessError(), 404],
    [new GradebookConflictError(), 409],
  ] as const)('maps authentication, access, and conflict failures', async (error, status) => {
    if (status === 401) requireAuth.mockRejectedValue(error);
    else openGradeDispute.mockRejectedValue(error);
    const { POST } = await import('./route');
    const response = await POST(request(validBody), context);
    expect(response.status).toBe(status);
  });
});

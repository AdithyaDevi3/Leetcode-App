import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GradebookAccessError, GradebookConflictError, GradebookRateLimitError } from '@leetcode-app/database';

const requireAuth = vi.fn();
const readRecipient = vi.fn();
const submitAttempt = vi.fn();
const close = vi.fn();

vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@leetcode-app/database', async (importOriginal) => {
  const original = await importOriginal<typeof import('@leetcode-app/database')>();
  return {
    ...original,
    databaseConfigFromEnv: vi.fn(() => ({})),
    createDatabaseClient: vi.fn(() => ({ close })),
    PostgresGradebookRepository: class { readRecipient = readRecipient; submitAttempt = submitAttempt; },
  };
});

const recipientId = '11111111-1111-4111-8111-111111111111';
const request = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const context = { params: Promise.resolve({ recipientId }) };

describe('/api/learner/assignments/[recipientId]/submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({ user: { id: '22222222-2222-4222-8222-222222222222' } });
    readRecipient.mockResolvedValue({ policy: { versionId: '33333333-3333-4333-8333-333333333333' } });
  });

  it('creates an assignment-only queued verification attempt', async () => {
    submitAttempt.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      responseRevisionId: '55555555-5555-4555-8555-555555555555',
      sequence: 1,
      verificationJobId: '66666666-6666-4666-8666-666666666666',
    });
    const { POST } = await import('./route');
    const response = await POST(request({ language: 'python', source: 'print(1)', requestKey: 'attempt-1' }), context);
    expect(response.status).toBe(202);
    expect(submitAttempt).toHaveBeenCalledWith({
      recipientId,
      policyVersionId: '33333333-3333-4333-8333-333333333333',
      response: { language: 'python', text: 'print(1)' },
      requestKey: 'attempt-1',
    });
    expect(await response.json()).toEqual({ attempt: expect.objectContaining({ sequence: 1, status: 'queued' }) });
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects malformed bodies before opening a database connection', async () => {
    const { POST } = await import('./route');
    const response = await POST(request({ language: 'ruby', source: 'puts 1', requestKey: 'attempt-1' }), context);
    expect(response.status).toBe(400);
    expect(readRecipient).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('reports the persisted terminal status on an idempotent retry', async () => {
    submitAttempt.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      responseRevisionId: '55555555-5555-4555-8555-555555555555',
      sequence: 1,
      verificationJobId: '66666666-6666-4666-8666-666666666666',
      verificationStatus: 'completed',
    });
    const { POST } = await import('./route');
    const response = await POST(request({ language: 'python', source: 'print(1)', requestKey: 'attempt-1' }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attempt: expect.objectContaining({ status: 'completed' }) });
  });

  it.each([
    [new Error('Unauthorized: Authentication required'), 401],
    [new GradebookAccessError(), 404],
    [new GradebookConflictError(), 409],
    [new GradebookRateLimitError(), 429],
  ] as const)('maps access failures without exposing details', async (error, status) => {
    if (status === 401) requireAuth.mockRejectedValue(error);
    else readRecipient.mockRejectedValue(error);
    const { POST } = await import('./route');
    const response = await POST(request({ language: 'typescript', source: 'console.log(1)', requestKey: 'attempt-1' }), context);
    expect(response.status).toBe(status);
  });
});

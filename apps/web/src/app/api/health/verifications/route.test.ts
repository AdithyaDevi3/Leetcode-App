import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ close: vi.fn(), create: vi.fn(), metrics: vi.fn() }));
vi.mock('@leetcode-app/database', () => ({
  createDatabaseClient: mocks.create,
  databaseConfigFromEnv: () => ({}),
  PostgresGradebookVerificationRepository: class { metrics = mocks.metrics; },
}));

const healthy = { queued: 1, running: 0, completed: 2, unavailable: 0, superseded: 0, expiredLeases: 0, oldestQueuedAgeMs: 9 };

describe('/api/health/verifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockReturnValue({ close: mocks.close });
    mocks.close.mockResolvedValue(undefined);
    process.env.CODE_EXECUTION_ENABLED = 'true';
    process.env.VERIFICATION_QUEUE_MAX_AGE_MS = '10';
  });
  afterEach(() => {
    delete process.env.CODE_EXECUTION_ENABLED;
    delete process.env.VERIFICATION_QUEUE_MAX_AGE_MS;
  });

  it('does not require database access while verification is disabled', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'disabled', service: 'gradebook-verification-queue' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('reports aggregate queue health and closes the database client', async () => {
    mocks.metrics.mockResolvedValue(healthy);
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'gradebook-verification-queue', metrics: healthy });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([
    ['stale queued work', { ...healthy, oldestQueuedAgeMs: 11 }],
    ['an expired lease', { ...healthy, expiredLeases: 1 }],
  ])('degrades for %s', async (_label, metrics) => {
    mocks.metrics.mockResolvedValue(metrics);
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe('degraded');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('reports unavailable and closes the client when metrics fail', async () => {
    mocks.metrics.mockRejectedValue(new Error('database unavailable'));
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', service: 'gradebook-verification-queue' });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

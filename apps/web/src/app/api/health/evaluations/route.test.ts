import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRuntimeQueueMetrics = vi.fn();
vi.mock('@/lib/evaluation-job-runtime', () => ({ getRuntimeQueueMetrics }));

const healthy = { queued: 1, running: 0, completed: 2, failed: 0, canceled: 0, deadLettered: 0, oldestQueuedAgeMs: 9 };

describe('/api/health/evaluations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.EVALUATION_QUEUE_MAX_AGE_MS = '10';
  });

  afterEach(() => {
    delete process.env.EVALUATION_QUEUE_MAX_AGE_MS;
  });

  it('reports aggregate queue health', async () => {
    getRuntimeQueueMetrics.mockResolvedValue(healthy);
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'evaluation-queue', metrics: healthy });
  });

  it('degrades when queued work exceeds the configured age', async () => {
    getRuntimeQueueMetrics.mockResolvedValue({ ...healthy, oldestQueuedAgeMs: 11 });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'degraded',
      service: 'evaluation-queue',
      metrics: { ...healthy, oldestQueuedAgeMs: 11 },
    });
  });

  it('reports unavailable without exposing the database error', async () => {
    getRuntimeQueueMetrics.mockRejectedValue(new Error('database unavailable'));
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable', service: 'evaluation-queue' });
  });
});

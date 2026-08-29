import { describe, expect, it, vi } from 'vitest';

const metrics = vi.fn();
vi.mock('@/lib/execution-jobs-postgres', () => ({ createExecutionJobStore: () => ({ metrics }) }));

describe('/api/health/executions', () => {
  it('does not require sandbox infrastructure while disabled', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'false';
    const { GET } = await import('./route');
    expect(await (await GET()).json()).toEqual({ status: 'disabled', service: 'execution-queue' });
  });

  it('degrades when queued jobs exceed their age budget', async () => {
    process.env.CODE_EXECUTION_ENABLED = 'true';
    process.env.EXECUTION_QUEUE_MAX_AGE_MS = '10';
    metrics.mockResolvedValue({ queued: 1, running: 0, completed: 0, failed: 0, canceled: 0, timedOut: 0, oldestQueuedAgeMs: 11 });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).status).toBe('degraded');
  });
});

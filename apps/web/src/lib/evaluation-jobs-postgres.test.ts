import { describe, expect, it, vi } from 'vitest';
import { createEvaluationJobStore } from './evaluation-jobs-postgres';

describe('PostgreSQL evaluation job store recovery', () => {
  it('requires the claimed attempt for every completion and failure', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createEvaluationJobStore({ query } as never);
    for (const attempt of [undefined, 0, -1, 1.5]) {
      await expect(store.complete('job-1', {}, attempt as number)).rejects.toThrow('claimed evaluation attempt');
      await expect(store.fail('job-1', 'failure', attempt as number)).rejects.toThrow('claimed evaluation attempt');
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('requeues stale claims and reports jobs exhausted by retries', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ status: 'queued' }, { status: 'failed' }] });
    const store = createEvaluationJobStore({ query } as never);

    await expect(store.recoverStaleRunning(60_000)).resolves.toEqual({ retried: 1, deadLettered: 1 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'running'"), [60_000]);
    expect(query.mock.calls[0][0]).toContain("'Worker lease expired before completion'");
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createExecutionJobStore } from './execution-jobs-postgres';

describe('PostgreSQL execution job store recovery', () => {
  it('requires a claimed attempt before accepting either completion or failure', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createExecutionJobStore({ query } as never);
    const result = { status: 'completed' as const, stdout: '', stderr: '', exitCode: 0, durationMs: 1,
      limits: { timeoutMs: 3000, memoryMb: 256, outputBytes: 50_000 } };
    for (const attempt of [undefined, 0, -1, 1.5]) {
      await expect(store.complete('run-1', result, attempt as number)).rejects.toThrow('claimed execution attempt');
      await expect(store.fail('run-1', 'failure', attempt as number)).rejects.toThrow('claimed execution attempt');
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('fails expired execution leases instead of repeating an unknown sandbox run', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'run-1' }] });
    const store = createExecutionJobStore({ query } as never);

    await expect(store.failStaleRunning(300_000)).resolves.toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'running'"), [300_000]);
    expect(query.mock.calls[0][0]).toContain('execution outcome is unknown');
  });
});

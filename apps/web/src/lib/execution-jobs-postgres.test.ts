import { describe, expect, it, vi } from 'vitest';
import { createExecutionJobStore } from './execution-jobs-postgres';

describe('PostgreSQL execution job store recovery', () => {
  it('fails expired execution leases instead of repeating an unknown sandbox run', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'run-1' }] });
    const store = createExecutionJobStore({ query } as never);

    await expect(store.failStaleRunning(300_000)).resolves.toBe(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status = 'running'"), [300_000]);
    expect(query.mock.calls[0][0]).toContain('execution outcome is unknown');
  });
});

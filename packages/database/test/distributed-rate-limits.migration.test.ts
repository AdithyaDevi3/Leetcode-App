import { describe, expect, it, vi } from 'vitest';
import * as migration from '../migrations/1791147600000_distributed-rate-limits';

describe('distributed rate limit migration', () => {
  it('creates a server-only counter table with expiry lookup', async () => {
    const sql = vi.fn();
    await migration.up({ sql } as never);
    const statement = sql.mock.calls[0][0] as string;
    expect(statement).toContain('CREATE TABLE rate_limit_counters');
    expect(statement).toContain('PRIMARY KEY (bucket_hash, window_started_at)');
    expect(statement).toContain('rate_limit_counters_expiry_idx');
    expect(statement).toContain('ENABLE ROW LEVEL SECURITY');
    expect(statement).toContain('REVOKE ALL ON TABLE rate_limit_counters FROM PUBLIC, anon, authenticated');
  });

  it('drops the counter table on rollback', async () => {
    const dropTable = vi.fn();
    await migration.down({ dropTable } as never);
    expect(dropTable).toHaveBeenCalledWith('rate_limit_counters');
  });
});

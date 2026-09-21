import { describe, expect, it, vi } from 'vitest';
import * as migration from '../migrations/1789430157595_admin-portal-foundation';

describe('admin portal foundation migration', () => {
  it('creates deny-by-default role and audit tables', async () => {
    const sql: string[] = [];
    const builder = {
      createType: vi.fn(),
      createTable: vi.fn(),
      createIndex: vi.fn(),
      func: (value: string) => value,
      sql: (statement: string) => sql.push(statement),
    };

    await migration.up(builder as never);

    expect(builder.createType).toHaveBeenCalledWith('administration_role', expect.arrayContaining(['administrator', 'support']));
    expect(builder.createTable).toHaveBeenCalledWith('administration_role_assignments', expect.any(Object));
    expect(builder.createTable).toHaveBeenCalledWith('administration_audit_events', expect.any(Object));
    expect(sql.join('\n')).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql.join('\n')).toContain('REVOKE ALL ON TABLE administration_role_assignments FROM PUBLIC, anon, authenticated');
    expect(sql.join('\n')).toContain("WHERE role = 'admin'");
  });
});

import { describe, expect, it, vi } from 'vitest';
import * as migration from '../migrations/1790971200000_gradebook-recipient-applicability';

describe('gradebook recipient applicability migration', () => {
  it('adds immutable, private applicability history and deterministic initialization', async () => {
    const sql: string[] = [];
    const builder = {
      sql: (statement: string) => sql.push(statement),
    };

    await migration.up(builder as never);

    const statements = sql.join('\n');
    expect(statements).toContain('CREATE TABLE gradebook_applicability_revisions');
    expect(statements).toContain("applicability IN ('assigned', 'excused')");
    expect(statements).toContain('length(reason) <= 4000');
    expect(statements).toContain("source text NOT NULL DEFAULT 'instructor'");
    expect(statements).toContain('UNIQUE (recipient_id, request_key)');
    expect(statements).toContain('UNIQUE (supersedes_id)');
    expect(statements).toContain("md5('gradebook-applicability:' || NEW.id::text)::uuid");
    expect(statements).toContain("md5('gradebook-applicability:' || r.id::text)::uuid");
    expect(statements).toContain('NEW.created_at');
    expect(statements).toContain('ORDER BY r.id');
    expect(statements).toContain('CREATE TRIGGER gradebook_recipient_initial_applicability');
    expect(statements).toContain('CREATE TRIGGER gradebook_applicability_revisions_immutable');
    expect(statements).toContain('ENABLE ROW LEVEL SECURITY');
    expect(statements).toContain('REVOKE ALL ON TABLE gradebook_applicability_revisions FROM PUBLIC, anon, authenticated');
  });

  it('removes the recipient trigger before dropping its function and table', async () => {
    const builder = { sql: vi.fn(), dropTable: vi.fn() };

    await migration.down(builder as never);

    expect(builder.sql.mock.calls[0][0]).toContain('DROP TRIGGER gradebook_recipient_initial_applicability');
    expect(builder.sql.mock.calls[1][0]).toContain('DROP FUNCTION gradebook_initialize_recipient_applicability');
    expect(builder.dropTable).toHaveBeenCalledWith('gradebook_applicability_revisions');
  });
});

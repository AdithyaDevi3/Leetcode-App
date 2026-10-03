import { describe, expect, it, vi } from 'vitest';
import * as migration from '../migrations/1791061200000_gradebook-dispute-events';

describe('gradebook dispute events migration', () => {
  it('adds private immutable dispute history with constrained resolution and lineage', async () => {
    const sql: string[] = [];
    const builder = { sql: (statement: string) => sql.push(statement) };

    await migration.up(builder as never);

    const statements = sql.join('\n');
    expect(statements).toContain('CREATE TABLE gradebook_dispute_events');
    expect(statements).toContain("status IN ('submitted', 'in_review', 'resolved', 'withdrawn', 'superseded')");
    expect(statements).toContain("outcome IN ('upheld', 'changed')");
    expect(statements).toContain("status = 'resolved' AND outcome = 'changed' AND replacement_grade_revision_id IS NOT NULL");
    expect(statements).toContain('length(reason) <= 4000');
    expect(statements).toContain('length(message) <= 4000');
    expect(statements).toContain("actor_role IN ('learner', 'instructor', 'system')");
    expect(statements).toContain('UNIQUE (recipient_id, request_key)');
    expect(statements).toContain('UNIQUE (recipient_id, sequence)');
    expect(statements).toContain('UNIQUE (supersedes_id)');
    expect(statements).toContain('FOREIGN KEY (publication_id, recipient_id, policy_id, grade_revision_id)');
    expect(statements).toContain('FOREIGN KEY (replacement_grade_revision_id, recipient_id, policy_id)');
    expect(statements).toContain('CREATE UNIQUE INDEX gradebook_dispute_one_lineage_per_publication_idx');
    expect(statements).toContain("prior.status IN ('resolved', 'withdrawn', 'superseded')");
    expect(statements).toContain('A terminal dispute can only be followed by a new publication dispute');
    expect(statements).toContain('Active dispute transitions must preserve their target');
    expect(statements).toContain("prior.status = 'submitted' AND NEW.status IN ('in_review', 'resolved', 'withdrawn', 'superseded')");
    expect(statements).toContain('CREATE TRIGGER gradebook_dispute_event_lineage');
    expect(statements).toContain('CREATE TRIGGER gradebook_dispute_events_immutable');
    expect(statements).toContain('ALTER TABLE gradebook_dispute_events ENABLE ROW LEVEL SECURITY');
    expect(statements).toContain('REVOKE ALL ON TABLE gradebook_dispute_events FROM PUBLIC, anon, authenticated');
  });

  it('drops the table and validation function before its supporting publication constraint', async () => {
    const builder = { sql: vi.fn(), dropTable: vi.fn() };

    await migration.down(builder as never);

    expect(builder.dropTable).toHaveBeenCalledWith('gradebook_dispute_events');
    expect(builder.sql.mock.calls[0][0]).toContain('DROP FUNCTION gradebook_validate_dispute_event()');
    expect(builder.sql.mock.calls[1][0]).toContain('DROP CONSTRAINT gradebook_publications_dispute_identity');
  });
});

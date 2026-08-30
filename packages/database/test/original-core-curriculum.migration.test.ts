import { describe, expect, it } from 'vitest';
import { down, up } from '../migrations/1734528010000_original-core-curriculum.js';

type RecordedCall = { name: string; args: unknown[] };

function migrationRecorder() {
  const calls: RecordedCall[] = [];
  const pgm = {
    createTable: (...args: unknown[]) => calls.push({ name: 'createTable', args }),
    createIndex: (...args: unknown[]) => calls.push({ name: 'createIndex', args }),
    dropTable: (...args: unknown[]) => calls.push({ name: 'dropTable', args }),
    sql: (...args: unknown[]) => calls.push({ name: 'sql', args }),
    func: (name: string) => name,
  };
  return { calls, pgm };
}

describe('original core curriculum migration', () => {
  it('creates private curriculum metadata and seeds original guided content', async () => {
    const { calls, pgm } = migrationRecorder();

    await up(pgm as never);

    expect(calls.filter((call) => call.name === 'createTable').map((call) => call.args[0])).toEqual([
      'curriculum_tracks',
      'curriculum_track_items',
      'content_concepts',
    ]);
    const sql = calls.filter((call) => call.name === 'sql').map((call) => call.args[0]).join('\n');
    expect(sql).toContain('ALTER TABLE curriculum_tracks ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('Frequency Ledger');
    expect(sql).toContain('Bounded-Variety Streak');
    expect(sql).toContain('Study Room Notification Digest');
    expect(sql).toContain('## Thought process');
    expect(sql).toContain('idempotency');
    expect(sql).not.toContain('LeetCode');
    expect(sql).not.toContain('NeetCode');
    expect(sql).not.toContain('Hello Interview');
  });

  it('removes seeded content before dropping curriculum metadata', async () => {
    const { calls, pgm } = migrationRecorder();

    await down(pgm as never);

    expect(calls[0]).toMatchObject({ name: 'sql' });
    expect(String(calls[0].args[0])).toContain('DELETE FROM content_items');
    expect(calls.filter((call) => call.name === 'dropTable').map((call) => call.args[0])).toEqual([
      'content_concepts',
      'curriculum_track_items',
      'curriculum_tracks',
    ]);
  });
});

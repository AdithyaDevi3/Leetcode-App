import { describe, expect, it } from 'vitest';
import * as migration from '../migrations/1794624000000_shared-coding-room-realtime';

describe('shared coding room realtime policy migration', () => {
  it('authorizes private channels only for active room members', async () => {
    const statements: string[] = [];
    await migration.up({ sql: (query: string) => statements.push(query) } as never);
    const sql = statements.join('\n');
    expect(sql).toContain('realtime.messages');
    expect(sql).toContain('realtime.topic()');
    expect(sql).toContain("room.status = 'open'");
    expect(sql).toContain('member.revoked_at IS NULL');
    expect(sql).toContain('(select auth.uid())');
    expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY');
  });
});

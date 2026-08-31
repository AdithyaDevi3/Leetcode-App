import { describe, expect, it } from 'vitest';
import * as migration from '../migrations/1734528015000_supabase-rls-policies';

describe('Supabase RLS policy migration', () => {
  it('defines ownership policies for learner requests and read policies for curriculum', async () => {
    const statements: string[] = [];
    await migration.up({ sql: (query: string) => statements.push(query) } as never);
    const sql = statements.join('\n');
    expect(sql).toContain('user_id = (select auth.uid())');
    expect(sql).toContain('learner_requests_insert_own');
    expect(sql).toContain('curriculum_tracks_public_read');
    expect(sql).toContain('TO anon, authenticated');
  });
});

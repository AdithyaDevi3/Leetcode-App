import { describe, expect, it } from 'vitest';
import { down, up } from '../migrations/1791823332641_learner-review-security.js';

describe('learner review security migration', () => {
  it('enables RLS and restricts every personalization row to its owner', async () => {
    const statements: string[] = [];
    await up({ sql: (query: string) => statements.push(query) } as never);
    const sql = statements.join('\n');
    for (const table of ['learner_profiles', 'concept_mastery', 'scheduled_reviews']) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`${table}_own_rows`);
    }
    expect(sql.match(/user_id = \(select auth\.uid\(\)\)/g)).toHaveLength(6);
  });

  it('removes policies without disabling RLS on rollback', async () => {
    const statements: string[] = [];
    await down({ sql: (query: string) => statements.push(query) } as never);
    expect(statements.join('\n')).toContain('DROP POLICY IF EXISTS scheduled_reviews_own_rows');
    expect(statements.join('\n')).not.toContain('DISABLE ROW LEVEL SECURITY');
  });
});

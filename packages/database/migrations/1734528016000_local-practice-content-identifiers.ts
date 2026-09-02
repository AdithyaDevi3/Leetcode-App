import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/** Register the guided workspace's stable slugs so durable records satisfy the
 * content_items UUID foreign key while the authored UI can keep readable IDs.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO content_items (id, slug, type, status, difficulty, estimated_minutes, tags)
    VALUES
      ('20000000-0000-0000-0000-000000000001', 'pair-with-target-v1', 'problem', 'published', 'beginner', 35, ARRAY['hash-map', 'original']),
      ('20000000-0000-0000-0000-000000000002', 'max-window-sum-v1', 'problem', 'published', 'beginner', 35, ARRAY['sliding-window', 'original']),
      ('20000000-0000-0000-0000-000000000003', 'tree-max-depth-v1', 'problem', 'published', 'beginner', 35, ARRAY['trees', 'recursion', 'original']),
      ('20000000-0000-0000-0000-000000000004', 'balanced-brackets-v1', 'problem', 'published', 'beginner', 30, ARRAY['stacks', 'original']),
      ('20000000-0000-0000-0000-000000000005', 'climb-stairs-v1', 'problem', 'published', 'beginner', 30, ARRAY['dynamic-programming', 'original']),
      ('20000000-0000-0000-0000-000000000006', 'island-count-v1', 'problem', 'published', 'intermediate', 40, ARRAY['graphs', 'original']),
      ('20000000-0000-0000-0000-000000000007', 'task-order-v1', 'problem', 'published', 'intermediate', 45, ARRAY['graphs', 'topological-sort', 'original']),
      ('20000000-0000-0000-0000-000000000008', 'two-sum-window-v1', 'problem', 'published', 'beginner', 35, ARRAY['hash-map', 'original']),
      ('20000000-0000-0000-0000-000000000009', 'coin-change-lite-v1', 'problem', 'published', 'intermediate', 45, ARRAY['dynamic-programming', 'original']),
      ('20000000-0000-0000-0000-000000000010', 'first-unique-index-v1', 'problem', 'published', 'beginner', 30, ARRAY['hash-map', 'original'])
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DELETE FROM content_items WHERE id IN (
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000010'
  )`);
}

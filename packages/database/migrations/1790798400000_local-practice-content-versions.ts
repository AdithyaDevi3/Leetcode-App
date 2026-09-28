import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO content_versions
      (id, content_id, version, title, description, markdown_content, starter_code, solution_code, test_cases)
    SELECT source.version_id, source.content_id, 1, source.title,
      'Interactive practice activity used by class assignments.',
      'Complete the linked interactive practice activity and submit your explanation.',
      NULL, NULL, '[]'::jsonb
    FROM (VALUES
      ('21000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000001'::uuid, 'Pair With Target'),
      ('21000000-0000-0000-0000-000000000002'::uuid, '20000000-0000-0000-0000-000000000002'::uuid, 'Max Window Sum'),
      ('21000000-0000-0000-0000-000000000003'::uuid, '20000000-0000-0000-0000-000000000003'::uuid, 'Tree Max Depth'),
      ('21000000-0000-0000-0000-000000000004'::uuid, '20000000-0000-0000-0000-000000000004'::uuid, 'Balanced Brackets'),
      ('21000000-0000-0000-0000-000000000005'::uuid, '20000000-0000-0000-0000-000000000005'::uuid, 'Climb Stairs'),
      ('21000000-0000-0000-0000-000000000006'::uuid, '20000000-0000-0000-0000-000000000006'::uuid, 'Island Count'),
      ('21000000-0000-0000-0000-000000000007'::uuid, '20000000-0000-0000-0000-000000000007'::uuid, 'Task Order'),
      ('21000000-0000-0000-0000-000000000008'::uuid, '20000000-0000-0000-0000-000000000008'::uuid, 'Two Sum Window'),
      ('21000000-0000-0000-0000-000000000009'::uuid, '20000000-0000-0000-0000-000000000009'::uuid, 'Coin Change Lite'),
      ('21000000-0000-0000-0000-000000000010'::uuid, '20000000-0000-0000-0000-000000000010'::uuid, 'First Unique Index')
    ) AS source(version_id, content_id, title)
    ON CONFLICT (content_id, version) DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("DELETE FROM content_versions WHERE id::text LIKE '21000000-0000-0000-0000-0000000000__'");
}

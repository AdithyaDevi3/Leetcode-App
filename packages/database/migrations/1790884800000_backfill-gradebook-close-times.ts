import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE gradebook_policies p
    SET closes_at = ((a.due_on + 1)::timestamp AT TIME ZONE 'UTC')
    FROM class_assignments a
    WHERE a.id = p.assignment_id
      AND a.due_on IS NOT NULL
      AND p.closes_at IS NULL
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE gradebook_policies p
    SET closes_at = NULL
    FROM class_assignments a
    WHERE a.id = p.assignment_id
      AND a.due_on IS NOT NULL
      AND p.closes_at = ((a.due_on + 1)::timestamp AT TIME ZONE 'UTC')
  `);
}

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/** Adds the workspace states before they are used by the follow-up migration. */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'not_started'`);
  pgm.sql(`ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'in_progress'`);
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // PostgreSQL enum values cannot be safely removed in-place.
}

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Brings the durable practice schema in line with the guided workspace. The
 * original schema supported guest ownership, but did not persist workspace
 * stage, draft metadata, or update timestamps used by the app.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS current_stage varchar(32) NOT NULL DEFAULT 'understand'`);
  pgm.sql(`ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS session_metadata jsonb NOT NULL DEFAULT '{}'::jsonb`);
  pgm.sql(`ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()`);
  pgm.sql(`ALTER TABLE practice_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS practice_sessions_guest_content_updated_idx ON practice_sessions (guest_id, content_id, updated_at DESC)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS practice_sessions_user_content_updated_idx ON practice_sessions (user_id, content_id, updated_at DESC)`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS practice_sessions_user_content_updated_idx`);
  pgm.sql(`DROP INDEX IF EXISTS practice_sessions_guest_content_updated_idx`);
  pgm.sql(`ALTER TABLE practice_sessions DROP COLUMN IF EXISTS updated_at`);
  pgm.sql(`ALTER TABLE practice_sessions DROP COLUMN IF EXISTS created_at`);
  pgm.sql(`ALTER TABLE practice_sessions DROP COLUMN IF EXISTS session_metadata`);
  pgm.sql(`ALTER TABLE practice_sessions DROP COLUMN IF EXISTS current_stage`);
}

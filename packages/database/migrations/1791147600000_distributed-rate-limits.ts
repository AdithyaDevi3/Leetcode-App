import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE rate_limit_counters (
      bucket_hash text NOT NULL CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
      window_started_at timestamptz NOT NULL,
      window_ends_at timestamptz NOT NULL,
      request_count bigint NOT NULL CHECK (request_count > 0),
      PRIMARY KEY (bucket_hash, window_started_at),
      CHECK (window_ends_at > window_started_at)
    );
    CREATE INDEX rate_limit_counters_expiry_idx ON rate_limit_counters(window_ends_at);
    ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE rate_limit_counters FROM PUBLIC, anon, authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('rate_limit_counters');
}

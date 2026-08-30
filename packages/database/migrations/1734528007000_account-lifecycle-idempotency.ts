import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`CREATE UNIQUE INDEX account_lifecycle_active_request_unique
    ON account_lifecycle_requests (user_id, type)
    WHERE status IN ('requested', 'processing')`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX account_lifecycle_active_request_unique');
}

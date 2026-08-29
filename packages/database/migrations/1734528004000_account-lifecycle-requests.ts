import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('account_lifecycle_request_type', ['export', 'deletion']);
  pgm.createType('account_lifecycle_request_status', ['requested', 'processing', 'completed', 'rejected']);
  pgm.createTable('account_lifecycle_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    type: { type: 'account_lifecycle_request_type', notNull: true },
    status: { type: 'account_lifecycle_request_status', notNull: true, default: 'requested' },
    reason: { type: 'text' },
    requested_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('account_lifecycle_requests', ['user_id', 'requested_at']);
  pgm.createIndex('account_lifecycle_requests', ['status', 'requested_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('account_lifecycle_requests');
  pgm.dropType('account_lifecycle_request_status');
  pgm.dropType('account_lifecycle_request_type');
}

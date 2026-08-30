import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

/** Learner-submitted ideas and missing-question requests. */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('learner_request_type', ['question', 'feature']);
  pgm.createType('learner_request_status', ['submitted', 'triaged', 'accepted', 'rejected', 'completed']);
  pgm.createTable('learner_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: 'users(id)', onDelete: 'CASCADE' },
    guest_id: { type: 'uuid', references: 'guest_identities(id)', onDelete: 'CASCADE' },
    type: { type: 'learner_request_type', notNull: true },
    title: { type: 'varchar(160)', notNull: true },
    description: { type: 'text', notNull: true },
    source_url: { type: 'text' },
    status: { type: 'learner_request_status', notNull: true, default: 'submitted' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { constraints: { check: "(user_id IS NOT NULL) <> (guest_id IS NOT NULL)" } });
  pgm.createIndex('learner_requests', ['user_id', 'created_at']);
  pgm.createIndex('learner_requests', ['guest_id', 'created_at']);
  pgm.createIndex('learner_requests', ['status', 'created_at']);
  pgm.sql('ALTER TABLE learner_requests ENABLE ROW LEVEL SECURITY');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('learner_requests');
  pgm.dropType('learner_request_status');
  pgm.dropType('learner_request_type');
}

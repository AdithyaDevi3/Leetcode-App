import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('administration_role', [
    'content_author',
    'content_reviewer',
    'rights_reviewer',
    'evaluator_reviewer',
    'support',
    'privacy_operator',
    'administrator',
  ]);

  pgm.createTable('administration_role_assignments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    role: { type: 'administration_role', notNull: true },
    assigned_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    assigned_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    revoked_at: { type: 'timestamptz' },
  });
  pgm.createIndex('administration_role_assignments', ['user_id']);
  pgm.createIndex('administration_role_assignments', ['assigned_by']);
  pgm.createIndex('administration_role_assignments', ['user_id', 'role'], {
    name: 'administration_role_assignments_active_unique',
    unique: true,
    where: 'revoked_at IS NULL',
  });

  pgm.createTable('administration_audit_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    actor_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'RESTRICT' },
    action: { type: 'varchar(100)', notNull: true },
    target_type: { type: 'varchar(100)', notNull: true },
    target_id: { type: 'varchar(255)', notNull: true },
    reason: { type: 'text', notNull: true },
    request_id: { type: 'varchar(100)' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('administration_audit_events', ['actor_id', 'created_at']);
  pgm.createIndex('administration_audit_events', ['target_type', 'target_id', 'created_at']);
  pgm.createIndex('administration_audit_events', 'created_at');

  pgm.sql(`
    ALTER TABLE administration_role_assignments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE administration_audit_events ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON TABLE administration_role_assignments FROM PUBLIC, anon, authenticated;
    REVOKE ALL ON TABLE administration_audit_events FROM PUBLIC, anon, authenticated;

    INSERT INTO administration_role_assignments (user_id, role)
    SELECT id, 'administrator'::administration_role
    FROM users
    WHERE role = 'admin'
    ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('administration_audit_events');
  pgm.dropTable('administration_role_assignments');
  pgm.dropType('administration_role');
}

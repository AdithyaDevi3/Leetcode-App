import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('evaluation_job_status', ['queued', 'running', 'completed', 'failed', 'canceled']);
  pgm.createType('appeal_status', ['submitted', 'in_review', 'resolved']);
  pgm.createTable('evaluation_jobs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: 'users(id)', onDelete: 'CASCADE', notNull: true },
    session_id: { type: 'uuid', references: 'practice_sessions(id)', onDelete: 'CASCADE', notNull: true },
    revision_number: { type: 'integer', notNull: true },
    evaluator_version: { type: 'varchar(100)', notNull: true },
    rubric_version: { type: 'varchar(100)', notNull: true },
    status: { type: 'evaluation_job_status', notNull: true, default: 'queued' },
    attempts: { type: 'integer', notNull: true, default: 0 },
    max_attempts: { type: 'integer', notNull: true, default: 3 },
    result: { type: 'jsonb' },
    error: { type: 'text' },
    queued_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
    dead_lettered_at: { type: 'timestamptz' },
  });
  pgm.createIndex('evaluation_jobs', ['user_id', 'session_id', 'revision_number', 'evaluator_version', 'rubric_version'], { unique: true });
  pgm.createIndex('evaluation_jobs', ['status', 'queued_at']);
  pgm.createTable('evaluation_appeals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    job_id: { type: 'uuid', references: 'evaluation_jobs(id)', onDelete: 'CASCADE', notNull: true },
    user_id: { type: 'uuid', references: 'users(id)', onDelete: 'CASCADE', notNull: true },
    finding_id: { type: 'varchar(255)', notNull: true },
    context: { type: 'text', notNull: true },
    status: { type: 'appeal_status', notNull: true, default: 'submitted' },
    reviewer_id: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    override_approved: { type: 'boolean' },
    override_reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved_at: { type: 'timestamptz' },
  });
  pgm.createTable('evaluation_appeal_audit', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    appeal_id: { type: 'uuid', references: 'evaluation_appeals(id)', onDelete: 'CASCADE', notNull: true },
    actor_id: { type: 'uuid', references: 'users(id)', onDelete: 'RESTRICT', notNull: true },
    action: { type: 'varchar(100)', notNull: true },
    reason: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('evaluation_appeal_audit');
  pgm.dropTable('evaluation_appeals');
  pgm.dropTable('evaluation_jobs');
  pgm.dropType('appeal_status');
  pgm.dropType('evaluation_job_status');
}

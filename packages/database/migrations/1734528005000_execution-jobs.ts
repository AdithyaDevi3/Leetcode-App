import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('execution_job_status', ['queued', 'running', 'completed', 'failed', 'canceled', 'timed_out']);
  pgm.createTable('execution_jobs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    session_id: { type: 'uuid', notNull: true, references: 'practice_sessions(id)', onDelete: 'CASCADE' },
    language: { type: 'varchar(32)', notNull: true },
    source: { type: 'text', notNull: true },
    stdin: { type: 'text', notNull: true, default: '' },
    limits: { type: 'jsonb', notNull: true },
    status: { type: 'execution_job_status', notNull: true, default: 'queued' },
    result: { type: 'jsonb' },
    error: { type: 'text' },
    attempts: { type: 'integer', notNull: true, default: 0 },
    max_attempts: { type: 'integer', notNull: true, default: 1 },
    queued_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    started_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('execution_jobs', ['user_id', 'session_id', 'queued_at']);
  pgm.createIndex('execution_jobs', ['status', 'queued_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('execution_jobs');
  pgm.dropType('execution_job_status');
}

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('learner_profiles', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users(id)', onDelete: 'CASCADE' },
    goal: { type: 'varchar(64)', notNull: true },
    target_date: { type: 'timestamptz' },
    experience: { type: 'varchar(32)', notNull: true },
    preferred_language: { type: 'varchar(32)', notNull: true },
    weekly_minutes: { type: 'integer', notNull: true },
    timezone: { type: 'varchar(100)', notNull: true },
    accessibility_notes: { type: 'text' },
    diagnostic_opt_in: { type: 'boolean', notNull: true, default: false },
    personalization_opt_out: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createTable('concept_mastery', {
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    concept_id: { type: 'varchar(255)', notNull: true },
    score: { type: 'integer', notNull: true },
    confidence: { type: 'numeric(3,2)', notNull: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { constraints: { primaryKey: ['user_id', 'concept_id'] } });
  pgm.createTable('scheduled_reviews', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    concept_id: { type: 'varchar(255)', notNull: true },
    interval_days: { type: 'integer', notNull: true },
    repetitions: { type: 'integer', notNull: true, default: 0 },
    due_at: { type: 'timestamptz', notNull: true },
    completed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('scheduled_reviews', ['user_id', 'due_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('scheduled_reviews');
  pgm.dropTable('concept_mastery');
  pgm.dropTable('learner_profiles');
}

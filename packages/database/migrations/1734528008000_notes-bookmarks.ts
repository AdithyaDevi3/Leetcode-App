import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('learner_notes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    session_id: { type: 'uuid', references: 'practice_sessions(id)', onDelete: 'SET NULL' },
    body: { type: 'text', notNull: true },
    anchor: { type: 'varchar(500)' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('learner_notes', ['user_id', 'content_id', 'updated_at']);
  pgm.createIndex('learner_notes', ['user_id', 'session_id', 'updated_at']);

  pgm.createTable('learner_bookmarks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    session_id: { type: 'uuid', references: 'practice_sessions(id)', onDelete: 'SET NULL' },
    label: { type: 'varchar(160)' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('learner_bookmarks', ['user_id', 'created_at']);
  pgm.createIndex('learner_bookmarks', ['user_id', 'content_id'], { unique: true, where: 'session_id IS NULL', name: 'learner_bookmarks_content_once' });
  pgm.createIndex('learner_bookmarks', ['user_id', 'content_id', 'session_id'], { unique: true, where: 'session_id IS NOT NULL', name: 'learner_bookmarks_session_once' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('learner_bookmarks');
  pgm.dropTable('learner_notes');
}

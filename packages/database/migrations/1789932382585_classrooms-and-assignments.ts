import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('classrooms', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(120)', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    join_code: { type: 'varchar(12)', notNull: true, unique: true },
    created_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    archived_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('classrooms', 'created_by');

  pgm.createTable('class_enrollments', {
    class_id: { type: 'uuid', notNull: true, references: 'classrooms(id)', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { constraints: { primaryKey: ['class_id', 'user_id'] } });
  pgm.createIndex('class_enrollments', 'user_id');

  pgm.createTable('class_assignments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    class_id: { type: 'uuid', notNull: true, references: 'classrooms(id)', onDelete: 'CASCADE' },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'RESTRICT' },
    title: { type: 'varchar(160)', notNull: true },
    instructions: { type: 'text', notNull: true, default: '' },
    due_on: { type: 'date' },
    created_by: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('class_assignments', ['class_id', 'due_on']);
  pgm.createIndex('class_assignments', ['class_id', 'content_id'], { unique: true });
  pgm.createIndex('class_assignments', 'content_id');
  pgm.createIndex('practice_sessions', ['user_id', 'content_id', 'status'], {
    name: 'practice_sessions_class_progress_idx',
  });

  pgm.sql(`
    ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE class_assignments ENABLE ROW LEVEL SECURITY;

    REVOKE ALL ON TABLE classrooms, class_enrollments, class_assignments
      FROM PUBLIC, anon, authenticated;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('practice_sessions', ['user_id', 'content_id', 'status'], {
    name: 'practice_sessions_class_progress_idx',
  });
  pgm.dropTable('class_assignments');
  pgm.dropTable('class_enrollments');
  pgm.dropTable('classrooms');
}

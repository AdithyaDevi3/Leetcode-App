import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create enum types
  pgm.createType('user_role', ['guest', 'learner', 'instructor', 'admin']);
  pgm.createType('content_type', ['lesson', 'problem', 'module']);
  pgm.createType('content_status', ['draft', 'published', 'archived']);
  pgm.createType('difficulty_level', ['beginner', 'intermediate', 'advanced']);
  pgm.createType('session_status', ['active', 'completed', 'abandoned']);
  pgm.createType('evaluation_status', ['pending', 'completed', 'failed']);

  // Users table
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'varchar(255)', unique: true, notNull: false },
    display_name: { type: 'varchar(255)', notNull: true },
    role: { type: 'user_role', notNull: true, default: 'learner' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    revision: { type: 'integer', notNull: true, default: 1 },
  });

  // Guest identities
  pgm.createTable('guest_identities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    device_fingerprint: { type: 'varchar(255)', notNull: true },
    session_token: { type: 'varchar(255)', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    upgraded_to_user_id: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
  });

  // User preferences
  pgm.createTable('user_preferences', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users(id)', onDelete: 'CASCADE' },
    theme: { type: 'varchar(50)', notNull: true, default: 'light' },
    language: { type: 'varchar(10)', notNull: true, default: 'en' },
    email_notifications: { type: 'boolean', notNull: true, default: true },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Content items
  pgm.createTable('content_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    slug: { type: 'varchar(255)', unique: true, notNull: true },
    type: { type: 'content_type', notNull: true },
    status: { type: 'content_status', notNull: true, default: 'draft' },
    difficulty: { type: 'difficulty_level', notNull: true },
    estimated_minutes: { type: 'integer', notNull: true },
    tags: { type: 'varchar(100)[]', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    revision: { type: 'integer', notNull: true, default: 1 },
  });

  // Content versions
  pgm.createTable('content_versions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    version: { type: 'integer', notNull: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true },
    markdown_content: { type: 'text', notNull: true },
    starter_code: { type: 'text' },
    solution_code: { type: 'text' },
    test_cases: { type: 'jsonb', notNull: true, default: '[]' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('content_versions', ['content_id', 'version'], { unique: true });

  // Rubric versions
  pgm.createTable('rubric_versions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    version: { type: 'integer', notNull: true },
    criteria: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('rubric_versions', ['content_id', 'version'], { unique: true });

  // Practice sessions
  pgm.createTable('practice_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: 'users(id)', onDelete: 'SET NULL' },
    guest_id: { type: 'uuid', references: 'guest_identities(id)', onDelete: 'SET NULL' },
    content_id: { type: 'uuid', notNull: true, references: 'content_items(id)', onDelete: 'CASCADE' },
    content_version: { type: 'integer', notNull: true },
    status: { type: 'session_status', notNull: true, default: 'active' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    completed_at: { type: 'timestamptz' },
    total_time_seconds: { type: 'integer', notNull: true, default: 0 },
    revision: { type: 'integer', notNull: true, default: 1 },
  });

  pgm.createIndex('practice_sessions', ['user_id']);
  pgm.createIndex('practice_sessions', ['guest_id']);
  pgm.createIndex('practice_sessions', ['content_id']);

  // Attempts
  pgm.createTable('attempts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id: { type: 'uuid', notNull: true, references: 'practice_sessions(id)', onDelete: 'CASCADE' },
    attempt_number: { type: 'integer', notNull: true },
    submitted_code: { type: 'text', notNull: true },
    submitted_pseudocode: { type: 'text' },
    submitted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('attempts', ['session_id', 'attempt_number'], { unique: true });

  // Pseudocode revisions
  pgm.createTable('pseudocode_revisions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    session_id: { type: 'uuid', notNull: true, references: 'practice_sessions(id)', onDelete: 'CASCADE' },
    revision_number: { type: 'integer', notNull: true },
    content: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('pseudocode_revisions', ['session_id', 'revision_number'], { unique: true });

  // Evaluations
  pgm.createTable('evaluations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    attempt_id: { type: 'uuid', notNull: true, references: 'attempts(id)', onDelete: 'CASCADE' },
    rubric_version: { type: 'integer', notNull: true },
    status: { type: 'evaluation_status', notNull: true, default: 'pending' },
    overall_score: { type: 'numeric(4,2)' },
    overall_feedback: { type: 'text' },
    evaluated_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('evaluations', ['attempt_id']);

  // Evaluation findings
  pgm.createTable('evaluation_findings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    evaluation_id: { type: 'uuid', notNull: true, references: 'evaluations(id)', onDelete: 'CASCADE' },
    criterion_id: { type: 'varchar(255)', notNull: true },
    score: { type: 'numeric(4,2)', notNull: true },
    feedback: { type: 'text', notNull: true },
    code_snippet: { type: 'text' },
    line_range_start: { type: 'integer' },
    line_range_end: { type: 'integer' },
  });

  pgm.createIndex('evaluation_findings', ['evaluation_id']);

  // Create updated_at trigger function
  pgm.createFunction(
    'update_updated_at_column',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true,
    },
    `
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    `
  );

  // Add updated_at triggers
  const tablesWithUpdatedAt = ['users', 'content_items', 'user_preferences'];
  tablesWithUpdatedAt.forEach((table) => {
    pgm.createTrigger(table, 'update_updated_at', {
      when: 'BEFORE',
      operation: 'UPDATE',
      function: 'update_updated_at_column',
      level: 'ROW',
    });
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop tables in reverse order
  pgm.dropTable('evaluation_findings');
  pgm.dropTable('evaluations');
  pgm.dropTable('pseudocode_revisions');
  pgm.dropTable('attempts');
  pgm.dropTable('practice_sessions');
  pgm.dropTable('rubric_versions');
  pgm.dropTable('content_versions');
  pgm.dropTable('content_items');
  pgm.dropTable('user_preferences');
  pgm.dropTable('guest_identities');
  pgm.dropTable('users');

  // Drop function
  pgm.dropFunction('update_updated_at_column', []);

  // Drop types
  pgm.dropType('evaluation_status');
  pgm.dropType('session_status');
  pgm.dropType('difficulty_level');
  pgm.dropType('content_status');
  pgm.dropType('content_type');
  pgm.dropType('user_role');
}

import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration: Add NextAuth tables for authentication
 * 
 * Adds tables required for NextAuth.js:
 * - accounts: OAuth provider accounts linked to users
 * - sessions: Active user sessions
 * - verification_tokens: One-time tokens for email verification
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Accounts table - OAuth provider accounts
  pgm.createTable('accounts', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    type: {
      type: 'varchar(50)',
      notNull: true,
    },
    provider: {
      type: 'varchar(100)',
      notNull: true,
    },
    provider_account_id: {
      type: 'varchar(255)',
      notNull: true,
    },
    refresh_token: {
      type: 'text',
    },
    access_token: {
      type: 'text',
    },
    expires_at: {
      type: 'bigint',
    },
    token_type: {
      type: 'varchar(50)',
    },
    scope: {
      type: 'text',
    },
    id_token: {
      type: 'text',
    },
    session_state: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Unique constraint on provider + provider_account_id
  pgm.createIndex('accounts', ['provider', 'provider_account_id'], { unique: true });
  pgm.createIndex('accounts', 'user_id');

  // Sessions table - active user sessions
  pgm.createTable('sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    session_token: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    expires: {
      type: 'timestamptz',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('sessions', 'session_token');
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'expires');

  // Verification tokens table - for email verification
  pgm.createTable('verification_tokens', {
    identifier: {
      type: 'varchar(255)',
      notNull: true,
    },
    token: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    expires: {
      type: 'timestamptz',
      notNull: true,
    },
  });

  pgm.createIndex('verification_tokens', ['identifier', 'token'], { unique: true });

  // Add updated_at trigger for accounts
  pgm.createTrigger('accounts', 'update_accounts_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Add updated_at trigger for sessions
  pgm.createTrigger('sessions', 'update_sessions_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('verification_tokens');
  pgm.dropTable('sessions');
  pgm.dropTable('accounts');
}

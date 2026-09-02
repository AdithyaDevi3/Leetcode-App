import type { DatabaseClient } from '../../src/client.js';

const DATABASE_STARTUP_RETRY_LIMIT = 20;
const DATABASE_STARTUP_RETRY_DELAY_MS = 250;

function isDatabaseStartingUp(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '57P03';
}

async function waitForDatabaseReady(dbClient: DatabaseClient): Promise<void> {
  for (let attempt = 0; attempt < DATABASE_STARTUP_RETRY_LIMIT; attempt += 1) {
    try {
      await dbClient.query('SELECT 1');
      return;
    } catch (error) {
      if (!isDatabaseStartingUp(error) || attempt === DATABASE_STARTUP_RETRY_LIMIT - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, DATABASE_STARTUP_RETRY_DELAY_MS));
    }
  }
}

/**
 * Reproduce the Supabase database primitives that application migrations rely
 * on when repository tests run against a plain PostgreSQL container.
 */
export async function prepareSupabaseTestDatabase(dbClient: DatabaseClient): Promise<void> {
  await waitForDatabaseReady(dbClient);

  await dbClient.query(`
    DO $$
    BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END
    $$;

    DO $$
    BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END
    $$;
  `);

  await dbClient.query('CREATE SCHEMA IF NOT EXISTS auth');
  await dbClient.query(`
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $function$;
  `);
}

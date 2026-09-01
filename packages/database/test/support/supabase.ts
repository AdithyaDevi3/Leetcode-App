import type { DatabaseClient } from '../../src/client.js';

/**
 * Reproduce the Supabase database primitives that application migrations rely
 * on when repository tests run against a plain PostgreSQL container.
 */
export async function prepareSupabaseTestDatabase(dbClient: DatabaseClient): Promise<void> {
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

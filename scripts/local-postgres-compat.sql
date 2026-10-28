-- LOCAL COMPOSE ONLY. This is a minimal migration compatibility shim, not an
-- Auth service. Never apply it to Supabase/hosted databases or use it as a
-- production migration. Existing Auth objects and privileges remain untouched.
BEGIN;

DO $local_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$local_roles$;

CREATE SCHEMA IF NOT EXISTS auth;

DO $local_auth$
BEGIN
  IF pg_catalog.to_regclass('auth.users') IS NULL THEN
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
      email text UNIQUE,
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      email_confirmed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
    );
    ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
  END IF;
  IF pg_catalog.to_regprocedure('auth.uid()') IS NULL THEN
    EXECUTE $definition$
      CREATE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
        AS $body$
          SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
        $body$
    $definition$;
  END IF;
END;
$local_auth$;

COMMIT;

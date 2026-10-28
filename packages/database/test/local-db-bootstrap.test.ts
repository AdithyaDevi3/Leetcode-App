import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';

const compatibilitySql = readFileSync(new URL('../../../scripts/local-postgres-compat.sql', import.meta.url), 'utf8');
let container: StartedTestContainer, database: DatabaseClient, config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = createDatabaseClient(config);
  // Deliberately do not call prepareSupabaseTestDatabase: this starts as plain PG16.
}, 60_000);
afterAll(async () => { await database?.close(); await container?.stop(); });

describe('local PostgreSQL compatibility bootstrap', () => {
  it('initializes a clean PostgreSQL16 database and all application migrations without a hosted Auth service', async () => {
    expect((await database.query("SELECT to_regnamespace('auth') AS auth")).rows[0].auth).toBeNull();
    expect((await database.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')")).rows).toEqual([]);
    await database.query(compatibilitySql);
    expect((await database.query('SHOW server_version_num')).rows[0].server_version_num).toMatch(/^16/);
    expect((await database.query("SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated') ORDER BY rolname")).rows).toEqual([
      { rolname: 'anon', rolcanlogin: false, rolsuper: false, rolbypassrls: false },
      { rolname: 'authenticated', rolcanlogin: false, rolsuper: false, rolbypassrls: false },
    ]);
    expect((await database.query("SELECT prosecdef,proconfig FROM pg_proc WHERE oid='auth.uid()'::regprocedure")).rows[0]).toEqual({ prosecdef: false, proconfig: ['search_path=pg_catalog'] });
    expect((await database.query("SELECT auth.uid() AS id")).rows[0].id).toBeNull();
    expect((await database.query("SELECT relrowsecurity FROM pg_class WHERE oid='auth.users'::regclass")).rows[0].relrowsecurity).toBe(true);
    await runMigrations(config);
    expect((await database.query("SELECT to_regclass('learning_evidence_work') AS evidence,to_regclass('quiz_score_evidence') AS quiz")).rows[0]).toEqual({ evidence: 'learning_evidence_work', quiz: 'quiz_score_evidence' });
  });

  it('reruns compatibility and migrations without resetting learners, content or Auth rows', async () => {
    const learner = (await database.query<{ id: string }>("INSERT INTO users(display_name,role)VALUES('Synthetic bootstrap learner','learner')RETURNING id")).rows[0].id;
    await database.query("INSERT INTO auth.users(id,email,raw_user_meta_data,email_confirmed_at)VALUES($1,'synthetic-bootstrap@example.invalid','{\"display_name\":\"Synthetic\"}',now())", [learner]);
    const history = (await database.query('SELECT id,name,run_on FROM pgmigrations ORDER BY id')).rows;
    const content = (await database.query('SELECT id,slug,revision FROM content_items ORDER BY id')).rows;
    const auth = (await database.query('SELECT * FROM auth.users WHERE id=$1', [learner])).rows;
    await database.query(compatibilitySql);
    await runMigrations(config);
    expect((await database.query('SELECT id,name,run_on FROM pgmigrations ORDER BY id')).rows).toEqual(history);
    expect((await database.query('SELECT id,slug,revision FROM content_items ORDER BY id')).rows).toEqual(content);
    expect((await database.query('SELECT * FROM auth.users WHERE id=$1', [learner])).rows).toEqual(auth);
    expect((await database.query('SELECT display_name FROM users WHERE id=$1', [learner])).rows[0].display_name).toBe('Synthetic bootstrap learner');
    const scoped = await database.transaction(async client => {
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [learner]);
      return (await client.query('SELECT auth.uid() AS id')).rows[0].id;
    });
    expect(scoped).toBe(learner);
    expect((await database.query("SELECT has_table_privilege('authenticated','auth.users','SELECT') AS allowed")).rows[0].allowed).toBe(false);
  });

  it('preserves pre-existing Auth definitions, columns, privileges and rows', async () => {
    await database.query('CREATE DATABASE existing_auth');
    const existing = createDatabaseClient({ ...config, database: 'existing_auth' });
    try {
      await existing.query(`CREATE SCHEMA auth;
        CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,local_canary text NOT NULL);
        INSERT INTO auth.users VALUES('00000000-0000-4000-8000-000000000001','existing@example.invalid','preserve this row');
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
          AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
        REVOKE EXECUTE ON FUNCTION auth.uid() FROM PUBLIC;`);
      const definition = (await existing.query("SELECT pg_get_functiondef('auth.uid()'::regprocedure) AS definition")).rows[0].definition;
      const table = (await existing.query("SELECT relrowsecurity,relacl FROM pg_class WHERE oid='auth.users'::regclass")).rows[0];
      const columns = (await existing.query("SELECT attname,atttypid,attnotnull FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attnum>0 ORDER BY attnum")).rows;
      const rows = (await existing.query('SELECT * FROM auth.users')).rows;
      await existing.query(compatibilitySql);
      await existing.query(compatibilitySql);
      expect((await existing.query("SELECT pg_get_functiondef('auth.uid()'::regprocedure) AS definition")).rows[0].definition).toBe(definition);
      expect((await existing.query("SELECT relrowsecurity,relacl FROM pg_class WHERE oid='auth.users'::regclass")).rows[0]).toEqual(table);
      expect((await existing.query("SELECT attname,atttypid,attnotnull FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attnum>0 ORDER BY attnum")).rows).toEqual(columns);
      expect((await existing.query('SELECT * FROM auth.users')).rows).toEqual(rows);
      expect((await existing.query("SELECT has_function_privilege('authenticated','auth.uid()','EXECUTE') AS allowed")).rows[0].allowed).toBe(false);
    } finally { await existing.close(); }
  });
});

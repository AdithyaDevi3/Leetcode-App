import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { LastAdministratorError, PostgresAdministrationRepository } from '../src/repositories/administration.repository.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let database: DatabaseClient;
let repository: PostgresAdministrationRepository;

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432)
    .start();

  const config: DatabaseConfig = {
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'testdb',
    user: 'test',
    password: 'test',
  };
  database = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(database);
  await runMigrations(config);
  repository = new PostgresAdministrationRepository(database);
}, 60_000);

afterEach(async () => {
  await database.query('TRUNCATE users CASCADE');
  await database.query('TRUNCATE auth.users CASCADE');
});

afterAll(async () => {
  if (database) await database.close();
  if (container) await container.stop();
});

async function createUser(email: string, role: 'learner' | 'admin' = 'learner'): Promise<string> {
  const result = await database.query<{ id: string }>(
    'INSERT INTO users (email, display_name, role) VALUES ($1, $2, $3) RETURNING id',
    [email, email.split('@')[0], role],
  );
  return result.rows[0].id;
}

describe('PostgresAdministrationRepository', () => {
  it('bootstraps the first confirmed administrator and records an audit event', async () => {
    const authUser = await database.query<{ id: string }>(`
      INSERT INTO auth.users (email, raw_user_meta_data, email_confirmed_at)
      VALUES ('owner@example.com', '{"display_name":"Project Owner"}'::jsonb, NOW())
      RETURNING id
    `);

    await expect(repository.bootstrapFirstAdministrator({
      email: 'owner@example.com',
      reason: 'Initial production administrator',
    })).resolves.toEqual({ userId: authUser.rows[0].id });

    expect(await repository.listActiveRoles(authUser.rows[0].id)).toEqual(['administrator']);
    const audit = await repository.listAuditEvents();
    expect(audit[0]).toMatchObject({
      action: 'administration.bootstrap',
      targetId: authUser.rows[0].id,
      reason: 'Initial production administrator',
    });
  });

  it('lists active roles and returns safe overview counts', async () => {
    const administratorId = await createUser('administrator@example.com');
    await database.query(
      "INSERT INTO administration_role_assignments (user_id, role) VALUES ($1, 'administrator')",
      [administratorId],
    );

    expect(await repository.listActiveRoles(administratorId)).toEqual(['administrator']);
    expect(await repository.getOverview()).toMatchObject({ users: 1, activePracticeSessions: 0, openFeedback: 0 });
  });

  it('replaces roles and records the before/after audit event transactionally', async () => {
    const administratorId = await createUser('administrator@example.com');
    const operatorId = await createUser('operator@example.com');
    await database.query(
      "INSERT INTO administration_role_assignments (user_id, role) VALUES ($1, 'administrator')",
      [administratorId],
    );

    const roles = await repository.replaceRoles({
      actorId: administratorId,
      targetUserId: operatorId,
      roles: ['support', 'evaluator_reviewer'],
      reason: 'Assigned to the launch support rotation',
      requestId: 'request-123',
    });

    expect(roles).toEqual(['evaluator_reviewer', 'support']);
    const audit = await repository.listAuditEvents();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'administration.roles.update', targetId: operatorId, requestId: 'request-123' });
    expect(audit[0].metadata).toEqual({ before: [], after: ['evaluator_reviewer', 'support'] });
  });

  it('prevents removing the final administrator', async () => {
    const administratorId = await createUser('administrator@example.com');
    await database.query(
      "INSERT INTO administration_role_assignments (user_id, role) VALUES ($1, 'administrator')",
      [administratorId],
    );

    await expect(repository.replaceRoles({
      actorId: administratorId,
      targetUserId: administratorId,
      roles: [],
      reason: 'Attempt to remove final administrator',
    })).rejects.toBeInstanceOf(LastAdministratorError);
  });

  it('keeps browser roles away from role assignments and audit events', async () => {
    const result = await database.query<{ table_name: string; rls_enabled: boolean; anon_access: boolean; authenticated_access: boolean }>(`
      SELECT relname AS table_name, relrowsecurity AS rls_enabled,
        has_table_privilege('anon', 'public.' || relname, 'select,insert,update,delete') AS anon_access,
        has_table_privilege('authenticated', 'public.' || relname, 'select,insert,update,delete') AS authenticated_access
      FROM pg_class
      WHERE relname IN ('administration_role_assignments', 'administration_audit_events')
      ORDER BY relname
    `);
    expect(result.rows).toEqual([
      { table_name: 'administration_audit_events', rls_enabled: true, anon_access: false, authenticated_access: false },
      { table_name: 'administration_role_assignments', rls_enabled: true, anon_access: false, authenticated_access: false },
    ]);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import {
  ClassCodeNotFoundError, DuplicateClassAssignmentError, PostgresClassroomRepository,
} from '../src/repositories/classroom.repository.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let database: DatabaseClient;
let repository: PostgresClassroomRepository;

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432)
    .start();
  const config: DatabaseConfig = {
    host: container.getHost(), port: container.getMappedPort(5432),
    database: 'testdb', user: 'test', password: 'test',
  };
  database = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(database);
  await runMigrations(config);
  repository = new PostgresClassroomRepository(database);
}, 60_000);

afterEach(async () => { if (database) await database.query('TRUNCATE users, classrooms CASCADE'); });
afterAll(async () => {
  if (database) await database.close();
  if (container) await container.stop();
});

async function createUser(name: string): Promise<string> {
  const result = await database.query<{ id: string }>(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
    [`${name}@example.test`, name],
  );
  return result.rows[0].id;
}

const activityId = '20000000-0000-0000-0000-000000000001';

describe('PostgresClassroomRepository', () => {
  it('creates an unguessable class code and audits class creation', async () => {
    const administratorId = await createUser('administrator');
    const classroom = await repository.createClass({
      name: 'Algorithms 101', description: 'Fall class', actorId: administratorId,
      reason: 'New algorithms cohort', requestId: 'request-create-class',
    });
    expect(classroom.joinCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
    expect(classroom.learnerCount).toBe(0);
    expect(await repository.listClasses()).toHaveLength(1);
    const audit = await database.query<{ action: string; target_id: string; request_id: string }>(
      'SELECT action, target_id, request_id FROM administration_audit_events',
    );
    expect(audit.rows).toEqual([{
      action: 'classes.create', target_id: classroom.id, request_id: 'request-create-class',
    }]);
  });

  it('enrolls only by a valid code, remains idempotent, and keeps other learners out', async () => {
    const administratorId = await createUser('administrator');
    const learnerId = await createUser('learner');
    const otherId = await createUser('other');
    const classroom = await repository.createClass({
      name: 'Algorithms 101', description: '', actorId: administratorId,
      reason: 'New algorithms cohort',
    });
    await expect(repository.joinClassByCode({ userId: learnerId, code: 'AAAAAAAAAAAA' }))
      .rejects.toBeInstanceOf(ClassCodeNotFoundError);
    expect(await repository.joinClassByCode({ userId: learnerId, code: classroom.joinCode }))
      .toMatchObject({ id: classroom.id, alreadyJoined: false });
    expect(await repository.joinClassByCode({ userId: learnerId, code: classroom.joinCode }))
      .toMatchObject({ id: classroom.id, alreadyJoined: true });
    expect(await repository.listStudentClasses(learnerId)).toHaveLength(1);
    expect(await repository.listStudentClasses(otherId)).toEqual([]);
    expect((await repository.getClassDetail(classroom.id)).learners).toHaveLength(1);
  });

  it('assigns published practice and derives progress from verified session status', async () => {
    const administratorId = await createUser('administrator');
    const learnerId = await createUser('learner');
    const classroom = await repository.createClass({
      name: 'Algorithms 101', description: '', actorId: administratorId,
      reason: 'New algorithms cohort',
    });
    await repository.joinClassByCode({ userId: learnerId, code: classroom.joinCode });
    await repository.createAssignment({
      classId: classroom.id, contentId: activityId, title: 'Pair With Target',
      instructions: 'Explain the map invariant.', dueOn: '2026-10-01', actorId: administratorId,
      reason: 'Week one practice task', requestId: 'request-assign',
    });
    expect((await repository.listStudentAssignments(learnerId))[0]).toMatchObject({
      className: 'Algorithms 101', activitySlug: 'pair-with-target-v1', completed: false,
    });
    await database.query(`
      INSERT INTO practice_sessions
        (user_id, content_id, content_version, current_stage, status, session_metadata, revision)
      VALUES ($1, $2, 1, 'evaluate', 'completed', '{}', 1)
    `, [learnerId, activityId]);
    expect((await repository.listStudentAssignments(learnerId))[0].completed).toBe(true);
    expect((await repository.listStudentClasses(learnerId))[0].completedCount).toBe(1);
    expect((await repository.getClassDetail(classroom.id)).assignments[0].completedCount).toBe(1);
    await expect(repository.createAssignment({
      classId: classroom.id, contentId: activityId, title: 'Again', instructions: '',
      dueOn: null, actorId: administratorId, reason: 'Repeat this practice task',
    })).rejects.toBeInstanceOf(DuplicateClassAssignmentError);
    const audit = await database.query<{ action: string }>(
      "SELECT action FROM administration_audit_events WHERE action = 'classes.assignments.create'",
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('does not grant browser database roles direct access to class data', async () => {
    const result = await database.query<{
      table_name: string; rls_enabled: boolean; anon_access: boolean; authenticated_access: boolean;
    }>(`
      SELECT relname AS table_name, relrowsecurity AS rls_enabled,
        has_table_privilege('anon', 'public.' || relname, 'select,insert,update,delete') AS anon_access,
        has_table_privilege('authenticated', 'public.' || relname, 'select,insert,update,delete') AS authenticated_access
      FROM pg_class
      WHERE relname IN ('classrooms', 'class_enrollments', 'class_assignments')
      ORDER BY relname
    `);
    expect(result.rows).toEqual([
      { table_name: 'class_assignments', rls_enabled: true, anon_access: false, authenticated_access: false },
      { table_name: 'class_enrollments', rls_enabled: true, anon_access: false, authenticated_access: false },
      { table_name: 'classrooms', rls_enabled: true, anon_access: false, authenticated_access: false },
    ]);
  });
});

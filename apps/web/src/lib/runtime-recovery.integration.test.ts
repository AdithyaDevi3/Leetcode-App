import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '@leetcode-app/database';
import type { AssignmentGradePolicy } from '@leetcode-app/domain';
import { runMigrations } from '../../../../packages/database/src/migrations/index.js';
import { prepareSupabaseTestDatabase } from '../../../../packages/database/test/support/supabase.js';
import { PostgresClassroomRepository } from '../../../../packages/database/src/repositories/classroom.repository.js';
import { ASSIGNMENT_VERIFIER_VERSION, PostgresGradebookRepository } from '../../../../packages/database/src/repositories/gradebook.repository.js';
import { PostgresGradebookVerificationRepository } from '../../../../packages/database/src/repositories/gradebook-verification.repository.js';
import { createEvaluationJobStore } from './evaluation-jobs-postgres';
import { createExecutionJobStore } from './execution-jobs-postgres';
import { processNextEvaluationJob, recoverStaleEvaluationJobs } from '../workers/evaluation-worker';

let container: StartedTestContainer;
let database: DatabaseClient;
let config: DatabaseConfig;
const connections = new Set<DatabaseClient>();
const contentId = '20000000-0000-0000-0000-000000000001';

function connection(databaseName = config.database) {
  const client = createDatabaseClient({ ...config, database: databaseName });
  connections.add(client);
  return client;
}
async function disconnect(client: DatabaseClient) {
  if (connections.delete(client)) await client.close();
}

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = connection();
  await prepareSupabaseTestDatabase(database);
  await runMigrations(config, 'up', new URL('../../../../packages/database/migrations', import.meta.url).pathname);
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_HOST', config.host);
  vi.stubEnv('POSTGRES_PORT', String(config.port));
  vi.stubEnv('POSTGRES_DB', config.database);
  vi.stubEnv('POSTGRES_USER', config.user);
  vi.stubEnv('POSTGRES_PASSWORD', config.password);
  vi.stubEnv('POSTGRES_SSL', 'false');
}, 60_000);

afterEach(async () => {
  for (const client of [...connections]) if (client !== database) await disconnect(client);
  await database?.query('TRUNCATE users CASCADE');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  for (const client of [...connections]) await disconnect(client);
  await container?.stop();
});

async function user(role: 'instructor' | 'learner' = 'learner') {
  const result = await database.query<{ id: string }>(
    'INSERT INTO users (display_name, role) VALUES ($1, $2) RETURNING id', ['Isolated recovery fixture', role],
  );
  return result.rows[0].id;
}

async function practice() {
  const userId = await user();
  const result = await database.query<{ id: string }>(
    'INSERT INTO practice_sessions (user_id, content_id, content_version) VALUES ($1, $2, 1) RETURNING id', [userId, contentId],
  );
  const sessionId = result.rows[0].id;
  await database.query('INSERT INTO pseudocode_revisions (session_id, revision_number, content) VALUES ($1, 1, $2)',
    [sessionId, 'Create a map. For each value check its complement, then store the value and position. Return the two distinct positions.']);
  return { userId, sessionId, revisionNumber: 1 };
}

async function assignment() {
  const instructorId = await user('instructor');
  const learnerId = await user();
  const classrooms = new PostgresClassroomRepository(database, instructorId);
  const classroom = await classrooms.createClass({ name: 'Recovery fixture class', description: '', actorId: instructorId, reason: 'Isolated recovery verification' });
  await classrooms.joinClassByCode({ userId: learnerId, code: classroom.joinCode });
  const assignmentId = await classrooms.createAssignment({ classId: classroom.id, contentId,
    title: 'Recovery fixture assignment', instructions: '', dueOn: null, actorId: instructorId,
    reason: 'Isolated recovery verification', publishDefaultGradePolicy: false });
  const version = await database.query<{ id: string }>('SELECT id FROM content_versions WHERE content_id=$1 ORDER BY version DESC LIMIT 1', [contentId]);
  await database.query('UPDATE content_versions SET test_cases=$1 WHERE id=$2', [JSON.stringify([{ input: 'fixture', expected: 'fixture' }]), version.rows[0].id]);
  const policy: AssignmentGradePolicy = { assignmentId, versionId: randomUUID(), contentVersionId: version.rows[0].id,
    maxUnits: 1000, attemptPolicy: 'latest', scoring: { mode: 'verified_completion', verifierVersionId: ASSIGNMENT_VERIFIER_VERSION } };
  const instructor = new PostgresGradebookRepository(database, { role: 'instructor', userId: instructorId });
  const learner = new PostgresGradebookRepository(database, { role: 'learner', userId: learnerId });
  const published = await instructor.publishPolicy({ policy, learnerIds: [learnerId], closesAt: null, reason: 'Isolated published policy' });
  const recipientId = published.recipients[0].id;
  await learner.submitAttempt({ recipientId, policyVersionId: policy.versionId,
    response: { text: 'print(input())', language: 'python' }, requestKey: randomUUID() });
  return { instructorId, learnerId, recipientId, instructor, learner, classroom };
}

describe('isolated durable runtime recovery', () => {
  it('recovers an abandoned evaluation across fresh connections and fences the prior claim', async () => {
    const principal = await practice();
    const producer = connection();
    const job = await createEvaluationJobStore(producer).enqueue(principal);
    await disconnect(producer);

    const oldWorker = createEvaluationJobStore(connection());
    const first = await oldWorker.claimNext();
    expect(first).toMatchObject({ id: job.id, attempts: 1 });
    await database.query("UPDATE evaluation_jobs SET started_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [job.id]);
    expect(await recoverStaleEvaluationJobs(10_000)).toEqual({ retried: 1, deadLettered: 0 });
    const replacement = createEvaluationJobStore(connection());
    const second = await replacement.claimNext();
    expect(second).toMatchObject({ id: job.id, attempts: 2 });

    expect(await oldWorker.complete(job.id, { evaluation: { score: 0 } }, first!.attempts)).toBe(false);
    expect(await oldWorker.fail(job.id, 'stale worker failure', first!.attempts)).toBe(false);
    expect(await replacement.findById(job.id)).toMatchObject({ status: 'running', attempts: 2, result: null });
    expect(await replacement.fail(job.id, 'transient evaluator restart', second!.attempts)).toBe(true);
    expect(await processNextEvaluationJob()).toEqual({ jobId: job.id, status: 'completed' });

    const reader = createEvaluationJobStore(connection());
    expect(await reader.findOwned(job.id, principal.userId, principal.sessionId)).toMatchObject({ status: 'completed', attempts: 3,
      result: { evaluation: { sessionId: principal.sessionId, revisionNumber: 1, score: expect.any(Number) } } });
    expect(await oldWorker.complete(job.id, { evaluation: { score: 0 } }, first!.attempts)).toBe(false);
    expect(await reader.enqueue(principal)).toMatchObject({ id: job.id, status: 'completed', attempts: 3 });
    expect(await reader.metrics()).toMatchObject({ queued: 0, running: 0, completed: 1 });
  });

  it('preserves an unknown sandbox outcome as unavailable instead of silently rerunning it', async () => {
    const principal = await practice();
    const oldConnection = connection();
    const oldWorker = createExecutionJobStore(oldConnection);
    const limits = { timeoutMs: 3000, memoryMb: 256, outputBytes: 50_000 };
    const job = await oldWorker.enqueue({ ...principal, request: { language: 'python', source: 'print("fixture")', limits } });
    const claim = await oldWorker.claimNext();
    expect(claim).toMatchObject({ id: job.id, attempts: 1 });
    await database.query("UPDATE execution_jobs SET started_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [job.id]);
    const replacement = createExecutionJobStore(connection());
    expect(await replacement.failStaleRunning(10_000)).toBe(1);
    expect(await oldWorker.complete(job.id, { status: 'completed', stdout: 'late fixture', stderr: '', exitCode: 0, durationMs: 1, limits }, claim!.attempts)).toBe(false);
    expect(await oldWorker.fail(job.id, 'late worker error', claim!.attempts)).toBe(false);
    await disconnect(oldConnection);
    expect(await replacement.claimNext()).toBeNull();
    expect(await replacement.failStaleRunning(10_000)).toBe(0);
    const reader = createExecutionJobStore(connection());
    expect(await reader.findOwned(job.id, principal.userId, principal.sessionId)).toMatchObject({ status: 'failed', attempts: 1, result: null,
      error: expect.stringContaining('execution outcome is unknown') });
    expect(await reader.metrics()).toMatchObject({ queued: 0, running: 0, failed: 1 });
  });

  it('recovers assignment verification once and retains one explicitly published grade across clients', async () => {
    const fixture = await assignment();
    const oldWorker = new PostgresGradebookVerificationRepository(connection());
    const first = await oldWorker.claimNext();
    await database.query("UPDATE gradebook_verification_jobs SET lease_expires_at=clock_timestamp()-INTERVAL '1 second' WHERE id=$1", [first!.id]);
    const replacement = new PostgresGradebookVerificationRepository(connection());
    const second = await replacement.claimNext();
    expect(second).toMatchObject({ id: first!.id, attempts: 2 });
    expect(second!.leaseToken).not.toBe(first!.leaseToken);
    const summary = { passedTests: 1, totalTests: 1, durationMs: 1 };
    expect(await oldWorker.resolve({ jobId: first!.id, leaseToken: first!.leaseToken, outcome: 'passed', summary })).toBeNull();
    expect(await oldWorker.unavailable({ jobId: first!.id, leaseToken: first!.leaseToken, errorCode: 'late-worker' })).toBeNull();
    const gradeId = await replacement.resolve({ jobId: second!.id, leaseToken: second!.leaseToken, outcome: 'passed', summary });
    expect(gradeId).toBeTruthy();
    expect(await replacement.resolve({ jobId: second!.id, leaseToken: second!.leaseToken, outcome: 'passed', summary })).toBeNull();
    expect((await fixture.learner.readRecipient(fixture.recipientId)).grades).toHaveLength(0);
    const input = { recipientId: fixture.recipientId, gradeRevisionId: gradeId!, expectedPublicationSequence: 0,
      reason: 'Release isolated recovered result', requestKey: randomUUID() };
    const publication = await fixture.instructor.publishGrade(input);
    expect(await fixture.instructor.publishGrade(input)).toEqual(publication);
    const fresh = new PostgresGradebookRepository(connection(), { role: 'learner', userId: fixture.learnerId });
    const history = await fresh.readRecipient(fixture.recipientId);
    expect(history.grades).toHaveLength(1);
    expect(history.grades[0]).toMatchObject({ id: gradeId, earnedUnits: 1000 });
    expect(history.publications).toEqual([publication]);
    expect((await database.query('SELECT id FROM gradebook_grade_revisions WHERE recipient_id=$1', [fixture.recipientId])).rows).toHaveLength(1);
  });

  it('round-trips published grading and queue state through an isolated logical backup and restore', async () => {
    const fixture = await assignment();
    const verifier = new PostgresGradebookVerificationRepository(connection());
    const claim = await verifier.claimNext();
    const gradeId = await verifier.resolve({ jobId: claim!.id, leaseToken: claim!.leaseToken,
      outcome: 'passed', summary: { passedTests: 1, totalTests: 1, durationMs: 1 } });
    const publicationInput = { recipientId: fixture.recipientId, gradeRevisionId: gradeId!, expectedPublicationSequence: 0,
      reason: 'Release isolated backup fixture', requestKey: randomUUID() };
    const publication = await fixture.instructor.publishGrade(publicationInput);
    const expected = await fixture.learner.readRecipient(fixture.recipientId);
    const dump = await container.exec(['pg_dump', '-U', 'test', '-d', 'testdb', '--format=custom', '--no-owner', '--file=/tmp/runtime-recovery.dump']);
    expect(dump.exitCode, dump.output).toBe(0);
    await database.query('CREATE DATABASE runtime_recovery_restore');
    const restored = await container.exec(['pg_restore', '-U', 'test', '-d', 'runtime_recovery_restore', '--no-owner', '--exit-on-error', '/tmp/runtime-recovery.dump']);
    expect(restored.exitCode, restored.output).toBe(0);
    const restoredDatabase = connection('runtime_recovery_restore');
    const learner = new PostgresGradebookRepository(restoredDatabase, { role: 'learner', userId: fixture.learnerId });
    expect(await learner.readRecipient(fixture.recipientId)).toEqual(expected);
    const instructor = new PostgresGradebookRepository(restoredDatabase, { role: 'instructor', userId: fixture.instructorId });
    expect(await instructor.publishGrade(publicationInput)).toEqual(publication);
    expect(await new PostgresGradebookVerificationRepository(restoredDatabase).metrics()).toMatchObject({ completed: 1, queued: 0, running: 0 });
    const permissions = await restoredDatabase.query<{ rls: boolean; readable: boolean }>(`SELECT relrowsecurity AS rls,
      has_table_privilege('authenticated','public.gradebook_grade_revisions','SELECT') AS readable FROM pg_class WHERE relname='gradebook_grade_revisions'`);
    expect(permissions.rows).toEqual([{ rls: true, readable: false }]);
    expect((await restoredDatabase.query('SELECT id FROM gradebook_publications WHERE recipient_id=$1', [fixture.recipientId])).rows).toHaveLength(1);
  });
});

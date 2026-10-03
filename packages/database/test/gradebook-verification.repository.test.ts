import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { AssignmentGradePolicy } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { ASSIGNMENT_VERIFIER_VERSION, PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import { PostgresGradebookVerificationRepository } from '../src/repositories/gradebook-verification.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let database: DatabaseClient;
const contentId = '10000000-0000-0000-0000-000000000001';
const pinnedTests = [{ input: '[2,7,11,15],9', expected: '[0,1]' }, { input: '[3,3],6', expected: '[0,1]' }];

beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432).start();
  const config: DatabaseConfig = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(database);
  await runMigrations(config);
}, 60_000);

afterEach(async () => { if (database) await database.query('TRUNCATE users, classrooms CASCADE'); });
afterAll(async () => { if (database) await database.close(); if (container) await container.stop(); });

async function createUser() {
  const result = await database.query<{ id: string }>(
    'INSERT INTO users (email, display_name) VALUES ($1,$2) RETURNING id',
    [`${randomUUID()}@example.test`, 'Verification fixture'],
  );
  return result.rows[0].id;
}

async function fixture(mode: 'verified' | 'reviewed' = 'verified', closesAt: Date | null = null, verifierVersionId = ASSIGNMENT_VERIFIER_VERSION, tests: unknown = pinnedTests) {
  const instructorId = await createUser();
  const learnerId = await createUser();
  const classrooms = new PostgresClassroomRepository(database, instructorId);
  const classroom = await classrooms.createClass({ name: 'Verifier tests', description: '', actorId: instructorId, reason: 'Fixture' });
  await classrooms.joinClassByCode({ userId: learnerId, code: classroom.joinCode });
  const assignmentId = await classrooms.createAssignment({ classId: classroom.id, contentId, title: 'Pinned verifier', instructions: '', dueOn: null, actorId: instructorId, reason: 'Fixture', publishDefaultGradePolicy: false });
  const version = await database.query<{ id: string }>('SELECT id FROM content_versions WHERE content_id=$1 ORDER BY version DESC LIMIT 1', [contentId]);
  await database.query('UPDATE content_versions SET test_cases=$1 WHERE id=$2', [JSON.stringify(tests), version.rows[0].id]);
  const scoring: AssignmentGradePolicy['scoring'] = mode === 'verified'
    ? { mode: 'verified_completion', verifierVersionId }
    : { mode: 'reviewed_rubric', rubricVersionId: 'rubric-v1', criteria: [{ id: 'correct', label: 'Correct', maxUnits: 1000 }] };
  const policy: AssignmentGradePolicy = { assignmentId, versionId: randomUUID(), contentVersionId: version.rows[0].id, maxUnits: 1000, attemptPolicy: 'latest', scoring };
  const instructor = new PostgresGradebookRepository(database, { role: 'instructor', userId: instructorId });
  const learner = new PostgresGradebookRepository(database, { role: 'learner', userId: learnerId });
  const published = await instructor.publishPolicy({ policy, learnerIds: [learnerId], closesAt, reason: 'Publish fixture' });
  const recipientId = published.recipients[0].id;
  const submit = (requestKey = randomUUID(), source = 'print("ok")') => learner.submitAttempt({
    recipientId, policyVersionId: policy.versionId, response: { text: source, language: mode === 'verified' ? 'python' : 'text' }, requestKey,
  });
  return { instructorId, learnerId, classroom, policy, recipientId, instructor, learner, submit };
}

describe('assignment verification persistence', () => {
  it('rejects a verified policy whose adapter is not implemented', async () => {
    await expect(fixture('verified', null, 'suite-v7')).rejects.toThrow('supported pinned stdin/stdout suite');
  });

  it('rejects a pinned suite whose UTF-8 bytes exceed the sandbox contract', async () => {
    await expect(fixture('verified', null, ASSIGNMENT_VERIFIER_VERSION, [{ input: '', expected: '界'.repeat(20_000) }]))
      .rejects.toThrow('supported pinned stdin/stdout suite');
  });

  it('atomically creates one pinned job and event and returns it on an idempotent retry', async () => {
    const f = await fixture();
    const key = randomUUID();
    const [first, retry] = await Promise.all([f.submit(key), f.submit(key)]);
    expect(retry).toEqual(first);
    expect(first.verificationJobId).toBeDefined();
    const jobs = await database.query('SELECT * FROM gradebook_verification_jobs WHERE attempt_id=$1', [first.id]);
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]).toMatchObject({ learner_id: f.learnerId, verifier_version_id: ASSIGNMENT_VERIFIER_VERSION, language: 'python', source: 'print("ok")', pinned_tests: pinnedTests, status: 'queued', attempts: 0 });
    const events = await database.query('SELECT status,reason FROM gradebook_verification_events WHERE verification_job_id=$1', [first.verificationJobId]);
    expect(events.rows).toEqual([{ status: 'queued', reason: 'assignment-submitted' }]);
  });

  it('reports aggregate queue health without exposing job payloads', async () => {
    const f = await fixture();
    await f.submit();
    const verifier = new PostgresGradebookVerificationRepository(database);
    await expect(verifier.metrics()).resolves.toMatchObject({
      queued: 1, running: 0, completed: 0, unavailable: 0, superseded: 0, expiredLeases: 0,
      oldestQueuedAgeMs: expect.any(Number),
    });
    const job = await verifier.claimNext();
    await database.query("UPDATE gradebook_verification_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [job!.id]);
    await expect(verifier.metrics()).resolves.toMatchObject({ queued: 0, running: 1, expiredLeases: 1 });
  });

  it('does not enqueue reviewed-rubric submissions', async () => {
    const f = await fixture('reviewed');
    const attempt = await f.submit();
    expect(attempt.verificationJobId).toBeUndefined();
    expect((await database.query('SELECT id FROM gradebook_verification_jobs')).rows).toEqual([]);
  });

  it('claims a queued job once across concurrent workers and issues a bounded lease', async () => {
    const f = await fixture();
    await f.submit();
    const workers = [new PostgresGradebookVerificationRepository(database), new PostgresGradebookVerificationRepository(database)];
    const claims = await Promise.all(workers.map(worker => worker.claimNext(5_000)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({ attempts: 1, maxAttempts: 3, verifierVersionId: ASSIGNMENT_VERIFIER_VERSION, pinnedTests });
    const row = (await database.query('SELECT status,lease_token,lease_expires_at,started_at FROM gradebook_verification_jobs')).rows[0];
    expect(row.status).toBe('running');
    expect(row.lease_token).toBeTruthy();
    expect(row.lease_expires_at).toBeTruthy();
    expect(row.started_at).toBeTruthy();
  });

  it.each([{ outcome: 'passed' as const, units: '1000' }, { outcome: 'failed' as const, units: '0' }])(
    'records a binary $outcome grade from a completed pinned job', async ({ outcome, units }) => {
      const f = await fixture();
      const attempt = await f.submit();
      const verifier = new PostgresGradebookVerificationRepository(database);
      const job = await verifier.claimNext();
      const summary = { passedTests: outcome === 'passed' ? 2 : 1, totalTests: 2, durationMs: 23 };
      const gradeId = await verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome, summary });
      expect(gradeId).toBeTruthy();
      const grade = await database.query('SELECT * FROM gradebook_grade_revisions WHERE id=$1', [gradeId]);
      expect(grade.rows[0]).toMatchObject({ attempt_id: attempt.id, earned_units: units, evaluator_version_id: ASSIGNMENT_VERIFIER_VERSION, authored_by: null, verification_job_id: job!.id });
      expect((await database.query('SELECT status,result_summary FROM gradebook_verification_jobs WHERE id=$1', [job!.id])).rows[0])
        .toMatchObject({ status: 'completed', result_summary: summary });
    },
  );

  it('retries unavailable work and exhausts without creating a grade', async () => {
    const f = await fixture();
    const attempt = await f.submit();
    await database.query('UPDATE gradebook_verification_jobs SET max_attempts=2 WHERE id=$1', [attempt.verificationJobId]);
    const verifier = new PostgresGradebookVerificationRepository(database);
    const first = await verifier.claimNext();
    expect(await verifier.unavailable({ jobId: first!.id, leaseToken: first!.leaseToken, errorCode: 'provider-unavailable', retryDelayMs: 0 })).toBe('queued');
    const second = await verifier.claimNext();
    expect(await verifier.unavailable({ jobId: second!.id, leaseToken: second!.leaseToken, errorCode: 'provider-unavailable', retryDelayMs: 0 })).toBe('unavailable');
    expect((await database.query('SELECT status,attempts,error_code FROM gradebook_verification_jobs WHERE id=$1', [second!.id])).rows[0])
      .toMatchObject({ status: 'unavailable', attempts: 2, error_code: 'provider-unavailable' });
    expect((await database.query('SELECT id FROM gradebook_grade_revisions')).rows).toEqual([]);
  });

  it('ignores an expired lease for either resolution or retry mutation', async () => {
    const f = await fixture();
    await f.submit();
    const verifier = new PostgresGradebookVerificationRepository(database);
    const job = await verifier.claimNext();
    await database.query("UPDATE gradebook_verification_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [job!.id]);
    await expect(verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'passed', summary: { passedTests: 2, totalTests: 2, durationMs: 20 } })).resolves.toBeNull();
    await expect(verifier.unavailable({ jobId: job!.id, leaseToken: job!.leaseToken, errorCode: 'late-worker' })).resolves.toBeNull();
    expect((await database.query('SELECT status FROM gradebook_verification_jobs WHERE id=$1', [job!.id])).rows[0].status).toBe('running');
    expect((await database.query('SELECT id FROM gradebook_grade_revisions')).rows).toEqual([]);
  });

  it('supersedes an old result when a newer assignment attempt exists', async () => {
    const f = await fixture();
    const oldAttempt = await f.submit();
    const verifier = new PostgresGradebookVerificationRepository(database);
    const oldJob = await verifier.claimNext();
    const newer = await f.submit(randomUUID(), 'print("new")');
    expect(newer.id).not.toBe(oldAttempt.id);
    await expect(verifier.resolve({ jobId: oldJob!.id, leaseToken: oldJob!.leaseToken, outcome: 'passed', summary: { passedTests: 2, totalTests: 2, durationMs: 20 } })).resolves.toBeNull();
    expect((await database.query('SELECT status FROM gradebook_verification_jobs WHERE id=$1', [oldJob!.id])).rows[0].status).toBe('superseded');
    expect((await database.query('SELECT id FROM gradebook_grade_revisions')).rows).toEqual([]);
  });

  it('keeps queue and event tables inaccessible to browser roles', async () => {
    await fixture();
    const permissions = await database.query<{ name: string; rls: boolean; anon: boolean; authenticated: boolean }>(`SELECT relname AS name, relrowsecurity AS rls,
      has_table_privilege('anon','public.'||relname,'select,insert,update,delete') AS anon,
      has_table_privilege('authenticated','public.'||relname,'select,insert,update,delete') AS authenticated
      FROM pg_class WHERE relname IN ('gradebook_verification_jobs','gradebook_verification_events') ORDER BY relname`);
    expect(permissions.rows).toHaveLength(2);
    for (const row of permissions.rows) expect(row).toMatchObject({ rls: true, anon: false, authenticated: false });
  });

  it('recovers expired leases and exhausts abandoned jobs without grading them', async () => {
    const retryFixture = await fixture();
    const retryAttempt = await retryFixture.submit();
    const verifier = new PostgresGradebookVerificationRepository(database);
    const first = await verifier.claimNext();
    await database.query("UPDATE gradebook_verification_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [first!.id]);
    const recovered = await verifier.claimNext();
    expect(recovered).toMatchObject({ id: retryAttempt.verificationJobId, attempts: 2 });
    await expect(verifier.resolve({ jobId: first!.id, leaseToken: first!.leaseToken, outcome: 'passed', summary: { passedTests: 2, totalTests: 2, durationMs: 20 } }))
      .resolves.toBeNull();

    await database.query('UPDATE gradebook_verification_jobs SET max_attempts=attempts, lease_expires_at=clock_timestamp()-interval \'1 second\' WHERE id=$1', [recovered!.id]);
    expect(await verifier.claimNext()).toBeNull();
    expect((await database.query('SELECT status,error_code FROM gradebook_verification_jobs WHERE id=$1', [recovered!.id])).rows[0])
      .toMatchObject({ status: 'unavailable', error_code: 'lease-expired' });
    expect((await database.query('SELECT id FROM gradebook_grade_revisions')).rows).toEqual([]);
  });

  it('rejects malformed outcomes, summaries, error codes, and mutable evidence', async () => {
    const f = await fixture();
    const attempt = await f.submit();
    const verifier = new PostgresGradebookVerificationRepository(database);
    const job = await verifier.claimNext();
    await expect(verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'unknown' as 'passed', summary: { passedTests: 2, totalTests: 2, durationMs: 1 } }))
      .rejects.toThrow('Invalid verification outcome');
    await expect(verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'passed', summary: { passedTests: 3, totalTests: 2, durationMs: 1 } }))
      .rejects.toThrow('Invalid verification summary');
    await expect(verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'passed', summary: { passedTests: 1, totalTests: 2, durationMs: 1 } }))
      .rejects.toThrow('Verification outcome does not match pinned test results');
    await expect(verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'failed', summary: { passedTests: 2, totalTests: 2, durationMs: 1 } }))
      .rejects.toThrow('Verification outcome does not match pinned test results');
    await expect(verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'passed', summary: { passedTests: 1, totalTests: 1, durationMs: 1 } }))
      .rejects.toThrow('Verification outcome does not match pinned test results');
    await expect(verifier.unavailable({ jobId: job!.id, leaseToken: job!.leaseToken, errorCode: 'Raw provider output!' }))
      .rejects.toThrow('Invalid verification error code');
    await expect(database.query('UPDATE gradebook_verification_jobs SET source=$1 WHERE id=$2', ['forged', attempt.verificationJobId]))
      .rejects.toMatchObject({ code: '23514' });
    const event = await database.query<{ id: string }>('SELECT id FROM gradebook_verification_events WHERE verification_job_id=$1 LIMIT 1', [attempt.verificationJobId]);
    await expect(database.query('UPDATE gradebook_verification_events SET reason=$1 WHERE id=$2', ['forged', event.rows[0].id]))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('cascades a learner deletion through verification provenance', async () => {
    const f = await fixture();
    await f.submit();
    const verifier = new PostgresGradebookVerificationRepository(database);
    const job = await verifier.claimNext();
    await verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'passed', summary: { passedTests: 2, totalTests: 2, durationMs: 20 } });
    await expect(database.query('DELETE FROM users WHERE id=$1', [f.learnerId])).resolves.toBeDefined();
    expect((await database.query('SELECT id FROM gradebook_verification_jobs WHERE learner_id=$1', [f.learnerId])).rows).toEqual([]);
  });

  it('allows an instructor-authored missing-work zero for a closed verified policy', async () => {
    const f = await fixture('verified', new Date('2000-01-01T00:00:00Z'));
    const grade = await f.instructor.appendGrade({
      recipientId: f.recipientId,
      attemptId: null,
      expectedGradeRevisionId: null,
      kind: 'missing_zero',
      criterionScores: {},
      reason: 'No assignment submission before close',
      requestKey: randomUUID(),
    });
    expect(grade).toMatchObject({ earnedUnits: 0 });
    const stored = await database.query('SELECT authored_by,verification_job_id FROM gradebook_grade_revisions WHERE id=$1', [grade.id]);
    expect(stored.rows[0]).toMatchObject({ authored_by: f.instructorId, verification_job_id: null });
  });

  it('rejects cross-lineage verification provenance in SQL', async () => {
    const left = await fixture();
    const right = await fixture();
    const leftAttempt = await left.submit();
    const rightAttempt = await right.submit();
    await expect(database.query(`UPDATE gradebook_verification_jobs SET attempt_id=$1 WHERE id=$2`, [rightAttempt.id, leftAttempt.verificationJobId]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(database.query(`INSERT INTO gradebook_grade_revisions
      (recipient_id,policy_id,attempt_id,sequence,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key,verification_job_id)
      VALUES($1,$2,$3,1,'scored',1000,$6,'{}','forged',NULL,$4,$5)`,
    [right.recipientId, right.policy.versionId, rightAttempt.id, randomUUID(), leftAttempt.verificationJobId, ASSIGNMENT_VERIFIER_VERSION])).rejects.toMatchObject({ code: '23514' });
  });

  it('never derives assignment credit from private practice or a different source', async () => {
    const f = await fixture();
    await database.query(`INSERT INTO practice_sessions
      (user_id,content_id,content_version,current_stage,status,session_metadata,revision)
      VALUES($1,$2,1,'evaluate','completed','{}',1)`, [f.learnerId, contentId]);
    expect((await database.query('SELECT id FROM gradebook_attempts')).rows).toEqual([]);
    expect((await database.query('SELECT id FROM gradebook_verification_jobs')).rows).toEqual([]);
    expect((await database.query('SELECT id FROM gradebook_grade_revisions')).rows).toEqual([]);
    const attempt = await f.submit(randomUUID(), 'print("assignment-only")');
    expect((await database.query('SELECT source FROM gradebook_verification_jobs WHERE id=$1', [attempt.verificationJobId])).rows[0].source)
      .toBe('print("assignment-only")');
  });
});

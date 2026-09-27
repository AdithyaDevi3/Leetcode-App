import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { AssignmentGradePolicy } from '@leetcode-app/domain';
import type { DatabaseClient as PublicDatabaseClient, PostgresGradebookRepository as PublicGradebookRepository } from '../src/public-api.js';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { GradebookAccessError, GradebookConflictError, PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import { PostgresGradebookVerificationRepository } from '../src/repositories/gradebook-verification.repository.js';
import { runMigrations } from '../src/migrations/index.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let database: DatabaseClient;
let migrationConfig: DatabaseConfig;
const contentId = '10000000-0000-0000-0000-000000000001';
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432).start();
  const config: DatabaseConfig = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  migrationConfig = config;
  database = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(database);
  await runMigrations(config);
}, 60_000);
afterEach(async () => { if (database) await database.query('TRUNCATE users, classrooms CASCADE'); });
afterAll(async () => { if (database) await database.close(); if (container) await container.stop(); });

async function user() {
  const result = await database.query<{ id: string }>('INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id', [`${randomUUID()}@example.test`, 'Synthetic learner']);
  return result.rows[0].id;
}
async function fixture(closesAt: string | null = null, publish = true) {
  const instructorId = await user(), learnerId = await user(), otherLearnerId = await user();
  const classrooms = new PostgresClassroomRepository(database, instructorId);
  const classroom = await classrooms.createClass({ name: 'Gradebook tests', description: '', actorId: instructorId, reason: 'Synthetic fixture' });
  await classrooms.joinClassByCode({ userId: learnerId, code: classroom.joinCode });
  await classrooms.joinClassByCode({ userId: otherLearnerId, code: classroom.joinCode });
  const assignmentId = await classrooms.createAssignment({ classId: classroom.id, contentId, title: 'Reviewed activity', instructions: '', dueOn: null, actorId: instructorId, reason: 'Synthetic fixture' });
  const version = await database.query<{ id: string }>('SELECT id FROM content_versions WHERE content_id = $1 ORDER BY version DESC LIMIT 1', [contentId]);
  const policy: AssignmentGradePolicy = { assignmentId, versionId: randomUUID(), contentVersionId: version.rows[0].id, maxUnits: 1000, attemptPolicy: 'latest', scoring: { mode: 'reviewed_rubric', rubricVersionId: 'reviewed-v1', criteria: [{ id: 'approach', label: 'Approach', maxUnits: 600 }, { id: 'explanation', label: 'Explanation', maxUnits: 400 }] } };
  const instructor = new PostgresGradebookRepository(database, { role: 'instructor', userId: instructorId });
  const learner = new PostgresGradebookRepository(database, { role: 'learner', userId: learnerId });
  const otherLearner = new PostgresGradebookRepository(database, { role: 'learner', userId: otherLearnerId });
  const publishInput = { policy, learnerIds: [learnerId, otherLearnerId], closesAt, reason: 'Publish reviewed policy' };
  const published = publish ? await instructor.publishPolicy(publishInput) : { policyId: policy.versionId, recipients: [] as { id: string; learnerId: string }[] };
  const recipientId = published.recipients.find(item => item.learnerId === learnerId)?.id ?? '';
  return { instructorId, learnerId, otherLearnerId, instructor, learner, otherLearner, policy, publishInput, published, recipientId, classroom, classrooms };
}
function submission(f: Awaited<ReturnType<typeof fixture>>, requestKey = randomUUID()) {
  return { recipientId: f.recipientId, policyVersionId: f.policy.versionId, response: { text: 'Use a map and check previously seen values.', language: 'text' }, requestKey };
}
async function scored(f: Awaited<ReturnType<typeof fixture>>) {
  const attempt = await f.learner.submitAttempt(submission(f));
  const input = { recipientId: f.recipientId, attemptId: attempt.id, expectedGradeRevisionId: null, kind: 'scored' as const, criterionScores: { approach: 500, explanation: 300 }, reason: 'Reviewed against published rubric', requestKey: randomUUID() };
  const grade = await f.instructor.appendGrade(input);
  return { attempt, input, grade };
}

describe('PostgresGradebookRepository', () => {
  it('accepts the public database client contract', () => {
    expectTypeOf<ConstructorParameters<typeof PublicGradebookRepository>[0]>().toEqualTypeOf<PublicDatabaseClient>();
  });
  it('round trips immutable policy, attempts, reviewed grades and publication while hiding drafts from learners', async () => {
    const f = await fixture();
    const { attempt, grade } = await scored(f);
    expect(grade).toMatchObject({ earnedUnits: 800, sequence: 1 });
    const teacherView = await f.instructor.readRecipient(f.recipientId);
    expect(teacherView.policy).toEqual(f.policy);
    expect(teacherView.attempts).toEqual([expect.objectContaining({ id: attempt.id, responseRevisionId: attempt.responseRevisionId, sequence: 1, response: submission(f).response })]);
    expect(teacherView.grades).toEqual([expect.objectContaining({ id: grade.id, earnedUnits: 800, kind: 'scored', attemptId: attempt.id })]);
    expect((await f.learner.readRecipient(f.recipientId)).grades).toEqual([]);
    const publication = await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish reviewed grade', requestKey: randomUUID() });
    expect(publication).toMatchObject({ sequence: 1, gradeRevisionId: grade.id });
    const studentView = await f.learner.readRecipient(f.recipientId);
    expect(studentView.grades).toHaveLength(1);
    expect(studentView.publications).toEqual([expect.objectContaining({ id: publication.id, gradeRevisionId: grade.id })]);
  });

  it('isolates owners and learners for reads and every write', async () => {
    const f = await fixture(), other = await fixture();
    const { grade, input } = await scored(f);
    await expect(other.instructor.readRecipient(f.recipientId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.otherLearner.readRecipient(f.recipientId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.otherLearner.submitAttempt(submission(f))).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(other.instructor.publishPolicy(f.publishInput)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.learner.publishPolicy(f.publishInput)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(other.instructor.appendGrade({ ...input, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.learner.appendGrade({ ...input, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(other.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Forged publication', requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('retries identical policy publication but rejects changed policies and unsupported attempt selection', async () => {
    const f = await fixture();
    expect(await f.instructor.publishPolicy(f.publishInput)).toEqual(f.published);
    await expect(f.instructor.publishPolicy({ ...f.publishInput, closesAt: '2099-01-01T00:00:00Z' })).rejects.toBeInstanceOf(GradebookConflictError);
    await expect(f.instructor.publishPolicy({ ...f.publishInput, policy: { ...f.policy, versionId: randomUUID(), attemptPolicy: 'best' } })).rejects.toThrow();
    expect((await f.instructor.readRecipient(f.recipientId)).policy).toEqual(f.policy);
  });

  it('rejects unenrolled recipients and unrelated content versions atomically', async () => {
    const f = await fixture(null, false), outsider = await user();
    await expect(f.instructor.publishPolicy({ ...f.publishInput, policy: { ...f.policy, versionId: randomUUID() }, learnerIds: [f.learnerId, outsider] })).rejects.toThrow();
    const foreign = await database.query<{ id: string }>('SELECT id FROM content_versions WHERE content_id <> $1 LIMIT 1', [contentId]);
    expect(foreign.rows).toHaveLength(1);
    await expect(f.instructor.publishPolicy({ ...f.publishInput, policy: { ...f.policy, versionId: randomUUID(), contentVersionId: foreign.rows[0].id } })).rejects.toThrow();
    expect((await database.query('SELECT * FROM gradebook_policies')).rows).toHaveLength(0);
  });

  it('deduplicates simultaneous identical submissions and rejects key reuse with changed payload', async () => {
    const f = await fixture(), input = submission(f);
    const attempts = await Promise.all([f.learner.submitAttempt(input), f.learner.submitAttempt(input)]);
    expect(attempts[0]).toEqual(attempts[1]);
    await expect(f.learner.submitAttempt({ ...input, response: { text: 'Different response' } })).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await f.instructor.readRecipient(f.recipientId)).attempts).toHaveLength(1);
  });

  it('allocates unique monotonic sequences to distinct concurrent submissions', async () => {
    const f = await fixture();
    const attempts = await Promise.all(Array.from({ length: 4 }, () => f.learner.submitAttempt(submission(f))));
    expect(attempts.map(item => item.sequence).sort()).toEqual([1, 2, 3, 4]);
    expect(new Set(attempts.map(item => item.responseRevisionId)).size).toBe(4);
  });

  it('rejects a mismatched policy and preserves learner history after enrollment withdrawal', async () => {
    const f = await fixture();
    await expect(f.learner.submitAttempt({ ...submission(f), policyVersionId: randomUUID() })).rejects.toThrow();
    const attempt = await f.learner.submitAttempt(submission(f));
    await database.query('DELETE FROM class_enrollments WHERE class_id = $1 AND user_id = $2', [f.classroom.id, f.learnerId]);
    expect((await f.instructor.readRecipient(f.recipientId)).attempts[0].id).toBe(attempt.id);
    await expect(f.learner.submitAttempt(submission(f))).rejects.toThrow();
  });

  it('bars new submissions when the class is archived', async () => {
    const f = await fixture();
    await database.query('UPDATE classrooms SET archived_at = now() WHERE id = $1', [f.classroom.id]);
    await expect(f.learner.submitAttempt(submission(f))).rejects.toThrow();
  });

  it('deduplicates grade writes and rejects stale correction revisions', async () => {
    const f = await fixture(), { input, grade } = await scored(f);
    expect(await f.instructor.appendGrade(input)).toEqual(grade);
    await expect(f.instructor.appendGrade({ ...input, criterionScores: { approach: 400, explanation: 300 } })).rejects.toBeInstanceOf(GradebookConflictError);
    await expect(f.instructor.appendGrade({ ...input, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
    const corrected = await f.instructor.appendGrade({ ...input, expectedGradeRevisionId: grade.id, criterionScores: { approach: 600, explanation: 400 }, requestKey: randomUUID() });
    expect(corrected).toMatchObject({ sequence: 2, earnedUnits: 1000 });
    expect((await f.instructor.readRecipient(f.recipientId)).grades).toHaveLength(2);
  });

  it.each([
    { approach: 601, explanation: 300 }, { approach: -1, explanation: 300 },
    { approach: 1.5, explanation: 300 }, { approach: 500 },
    { approach: 500, explanation: 300, invented: 1 }, { approach: Number.MAX_SAFE_INTEGER + 1, explanation: 300 },
  ])('rejects invalid rubric scores without creating a revision: %j', async criterionScores => {
    const f = await fixture(), attempt = await f.learner.submitAttempt(submission(f));
    await expect(f.instructor.appendGrade({ recipientId: f.recipientId, attemptId: attempt.id, expectedGradeRevisionId: null, kind: 'scored', criterionScores, reason: 'Invalid score fixture', requestKey: randomUUID() })).rejects.toThrow();
    expect((await f.instructor.readRecipient(f.recipientId)).grades).toEqual([]);
  });

  it('publishes with compare-and-set and never leaks an unpublished correction', async () => {
    const f = await fixture(), { grade, input } = await scored(f);
    const publicationInput = { recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish score', requestKey: randomUUID() };
    const outcomes = await Promise.allSettled([f.instructor.publishGrade(publicationInput), f.instructor.publishGrade({ ...publicationInput, requestKey: randomUUID() })]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(item => item.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(GradebookConflictError);
    const successful = outcomes.find(item => item.status === 'fulfilled');
    const key = outcomes[0].status === 'fulfilled' ? publicationInput : null;
    if (key) expect(await f.instructor.publishGrade(key)).toEqual(successful?.status === 'fulfilled' && successful.value);
    await f.instructor.appendGrade({ ...input, expectedGradeRevisionId: grade.id, criterionScores: { approach: 600, explanation: 400 }, requestKey: randomUUID() });
    const visible = await f.learner.readRecipient(f.recipientId);
    expect(visible.grades).toEqual([expect.objectContaining({ id: grade.id, earnedUnits: 800 })]);
  });

  it('prevents old attempts and superseded grades from becoming the current publication', async () => {
    const f = await fixture(), { grade } = await scored(f);
    await f.learner.submitAttempt(submission(f));
    await expect(f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Stale result', requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await f.learner.readRecipient(f.recipientId)).grades).toEqual([]);
  });

  it('records attributable missing-work zero only after close and when no submission exists', async () => {
    const f = await fixture('2000-01-01T00:00:00Z');
    const input = { recipientId: f.recipientId, attemptId: null, expectedGradeRevisionId: null, kind: 'missing_zero' as const, criterionScores: {}, reason: 'Instructor explicitly finalized missing work', requestKey: randomUUID() };
    await expect(f.instructor.appendGrade({ ...input, reason: ' ' })).rejects.toThrow();
    const grade = await f.instructor.appendGrade(input);
    expect(grade.earnedUnits).toBe(0);
    const future = await fixture('2099-01-01T00:00:00Z');
    await expect(future.instructor.appendGrade({ ...input, recipientId: future.recipientId, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
    const other = await fixture();
    await expect(other.instructor.appendGrade({ ...input, recipientId: other.recipientId, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
    await other.learner.submitAttempt(submission(other));
    await expect(other.instructor.appendGrade({ ...input, recipientId: other.recipientId, requestKey: randomUUID() })).rejects.toThrow();
    const closed = await fixture('2000-01-01T00:00:00Z');
    await database.query(`INSERT INTO gradebook_attempts (recipient_id,policy_id,response_revision_id,sequence,response,request_key,submitted_at)
      VALUES ($1,$2,$3,1,'{"text":"Historical accepted work"}',$4,'1999-01-01T00:00:00Z')`, [closed.recipientId, closed.policy.versionId, randomUUID(), randomUUID()]);
    await expect(closed.instructor.appendGrade({ ...input, recipientId: closed.recipientId, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);

  });

  it('does not turn historical completed private practice into assignment attempts or grades', async () => {
    const f = await fixture();
    await database.query("INSERT INTO practice_sessions (user_id, content_id, content_version, current_stage, status, session_metadata, revision) VALUES ($1, $2, 1, 'evaluate', 'completed', '{}', 1)", [f.learnerId, contentId]);
    expect((await f.classrooms.getClassDetail(f.classroom.id)).assignments[0].completedCount).toBe(1);
    const result = await f.instructor.readRecipient(f.recipientId);
    expect(result.attempts).toEqual([]);
    expect(result.grades).toEqual([]);
  });

  it('rejects submissions after the pinned close time', async () => {
    const f = await fixture('2000-01-01T00:00:00Z');
    await expect(f.learner.submitAttempt(submission(f))).rejects.toThrow();
    expect((await f.instructor.readRecipient(f.recipientId)).attempts).toEqual([]);
  });

  it('cascades deleted learner records without deleting another recipient', async () => {
    const f = await fixture(), { grade } = await scored(f);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish', requestKey: randomUUID() });
    await database.query('DELETE FROM users WHERE id = $1', [f.learnerId]);
    for (const table of ['gradebook_attempts', 'gradebook_grade_revisions', 'gradebook_publications']) {
      expect((await database.query(`SELECT id FROM ${table} WHERE recipient_id = $1`, [f.recipientId])).rows).toEqual([]);
    }
    expect((await database.query('SELECT id FROM gradebook_recipients')).rows).toHaveLength(1);
  });

  it('rolls back a grade when its audit write fails', async () => {
    const f = await fixture(), attempt = await f.learner.submitAttempt(submission(f));
    await database.query(`CREATE FUNCTION test_reject_gradebook_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$;
      CREATE TRIGGER test_gradebook_audit_failure BEFORE INSERT ON administration_audit_events FOR EACH ROW EXECUTE FUNCTION test_reject_gradebook_audit();`);
    try {
      await expect(f.instructor.appendGrade({ recipientId: f.recipientId, attemptId: attempt.id, expectedGradeRevisionId: null, kind: 'scored', criterionScores: { approach: 600, explanation: 400 }, reason: 'Must roll back', requestKey: randomUUID() })).rejects.toThrow('Synthetic audit failure');
      expect((await f.instructor.readRecipient(f.recipientId)).grades).toEqual([]);
    } finally {
      await database.query('DROP TRIGGER test_gradebook_audit_failure ON administration_audit_events; DROP FUNCTION test_reject_gradebook_audit();');
    }
  });

  it('enforces attempt lineage even for direct server SQL', async () => {
    const f = await fixture(), { grade } = await scored(f);
    const otherRecipient = f.published.recipients.find(item => item.learnerId === f.otherLearnerId)!.id;
    await expect(database.query(`INSERT INTO gradebook_publications
      (recipient_id, policy_id, grade_revision_id, sequence, reason, published_by, request_key)
      VALUES ($1,$2,$3,1,'Cross-learner grade',$4,$5)`, [otherRecipient, f.policy.versionId, grade.id, f.instructorId, randomUUID()])).rejects.toMatchObject({ code: '23503' });
    await expect(database.query(`INSERT INTO gradebook_grade_revisions
      (recipient_id, policy_id, sequence, attempt_id, kind, earned_units, evaluator_version_id, criterion_scores, reason, authored_by, request_key)
      SELECT recipient_id, policy_id, 2, attempt_id, kind, 1001, evaluator_version_id, criterion_scores, reason, authored_by, $1
      FROM gradebook_grade_revisions WHERE id = $2`, [randomUUID(), grade.id])).rejects.toMatchObject({ code: '23514' });

    await expect(database.query(`INSERT INTO gradebook_grade_revisions
      (recipient_id, policy_id, sequence, attempt_id, kind, earned_units, evaluator_version_id, criterion_scores, reason, authored_by, request_key)
      SELECT $1, policy_id, 1, attempt_id, kind, earned_units, evaluator_version_id, criterion_scores, reason, authored_by, $2
      FROM gradebook_grade_revisions WHERE id = $3`, [otherRecipient, randomUUID(), grade.id])).rejects.toMatchObject({ code: '23503' });
  });

  it('freezes source content and enforces binary completion grades in SQL', async () => {
    const f = await fixture(null, false);
    const policy: AssignmentGradePolicy = { ...f.policy, scoring: { mode: 'verified_completion', verifierVersionId: 'tests-v1' } };
    const published = await f.instructor.publishPolicy({ ...f.publishInput, policy });
    const recipientId = published.recipients.find(item => item.learnerId === f.learnerId)!.id;
    const attempt = await f.learner.submitAttempt({ ...submission(f), recipientId, response: { text: 'print(1)', language: 'python' } });
    const job = await new PostgresGradebookVerificationRepository(database).claimNext();
    expect(job?.id).toBe(attempt.verificationJobId);
    const snapshot = await database.query('SELECT content_snapshot FROM gradebook_policies WHERE id = $1', [policy.versionId]);
    const original = await database.query<{ title: string }>('SELECT title FROM content_versions WHERE id = $1', [policy.contentVersionId]);
    try {
      await database.query('UPDATE content_versions SET title = $1 WHERE id = $2', ['Edited source title', policy.contentVersionId]);
      expect((await database.query('SELECT content_snapshot FROM gradebook_policies WHERE id = $1', [policy.versionId])).rows).toEqual(snapshot.rows);
    } finally {
      await database.query('UPDATE content_versions SET title = $1 WHERE id = $2', [original.rows[0].title, policy.contentVersionId]);
    }
    const insert = `INSERT INTO gradebook_grade_revisions (recipient_id,policy_id,sequence,attempt_id,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key,verification_job_id)
      VALUES ($1,$2,1,$3,'scored',$4,'tests-v1','{}','Pinned verifier result',NULL,$5,$6)`;
    await expect(database.query(insert, [recipientId, policy.versionId, attempt.id, 500, randomUUID(), job!.id])).rejects.toMatchObject({ code: '23514' });
    await database.query(insert, [recipientId, policy.versionId, attempt.id, 1000, randomUUID(), job!.id]);
  });

  it('upgrades legacy class data and can reverse only the additive migration', async () => {
    const f = await fixture(null, false);
    await database.query("INSERT INTO practice_sessions (user_id, content_id, content_version, current_stage, status, session_metadata, revision) VALUES ($1, $2, 1, 'evaluate', 'completed', '{}', 1)", [f.learnerId, contentId]);
    const options = { databaseUrl: `postgresql://test:test@${migrationConfig.host}:${migrationConfig.port}/testdb`, dir: 'migrations', migrationsTable: 'pgmigrations', count: 2 };
    await runner({ ...options, direction: 'down' });
    expect((await database.query("SELECT to_regclass('gradebook_policies') AS table_name")).rows[0].table_name).toBeNull();
    expect((await f.classrooms.getClassDetail(f.classroom.id)).assignments[0].completedCount).toBe(1);
    await runner({ ...options, direction: 'up' });
    expect((await database.query('SELECT * FROM gradebook_policies')).rows).toEqual([]);
    expect((await f.classrooms.getClassDetail(f.classroom.id)).assignments[0].completedCount).toBe(1);
    await f.instructor.publishPolicy(f.publishInput);
  });

  it('keeps all gradebook tables inaccessible to browser roles', async () => {
    const result = await database.query<{ name: string; rls: boolean; anon: boolean; authenticated: boolean }>(`SELECT relname AS name, relrowsecurity AS rls,
      has_table_privilege('anon', 'public.' || relname, 'select,insert,update,delete') AS anon,
      has_table_privilege('authenticated', 'public.' || relname, 'select,insert,update,delete') AS authenticated
      FROM pg_class WHERE relname IN ('gradebook_policies', 'gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'gradebook_publications')`);
    expect(result.rows).toHaveLength(5);
    for (const row of result.rows) expect(row).toMatchObject({ rls: true, anon: false, authenticated: false });
  });

  it('rejects updates to immutable policies, attempts, grades and publications', async () => {
    const f = await fixture(), { attempt, grade } = await scored(f);
    const publication = await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish', requestKey: randomUUID() });
    for (const [table, id] of [['gradebook_policies', f.policy.versionId], ['gradebook_attempts', attempt.id], ['gradebook_grade_revisions', grade.id], ['gradebook_publications', publication.id]]) {
      await expect(database.query(`UPDATE ${table} SET id = id WHERE id = $1`, [id])).rejects.toThrow();
    }
  });
});

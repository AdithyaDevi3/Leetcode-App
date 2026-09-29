import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { AssignmentGradePolicy } from '@leetcode-app/domain';
import type { DatabaseClient as PublicDatabaseClient, PostgresGradebookRepository as PublicGradebookRepository } from '../src/public-api.js';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { ASSIGNMENT_VERIFIER_VERSION, GradebookAccessError, GradebookConflictError, PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
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
  const assignmentId = await classrooms.createAssignment({ classId: classroom.id, contentId, title: 'Reviewed activity', instructions: '', dueOn: null, actorId: instructorId, reason: 'Synthetic fixture', publishDefaultGradePolicy: false });
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

  it('rejects a draft for an attempt superseded by a learner resubmission', async () => {
    const f = await fixture();
    const first = await f.learner.submitAttempt(submission(f));
    await f.learner.submitAttempt(submission(f));
    await expect(f.instructor.appendGrade({
      recipientId: f.recipientId,
      attemptId: first.id,
      expectedGradeRevisionId: null,
      kind: 'scored',
      criterionScores: { approach: 500, explanation: 300 },
      learnerFeedback: 'Good direction.',
      privateNote: 'Review the newer response.',
      reason: 'Stale review fixture',
      requestKey: randomUUID(),
    })).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await f.instructor.readRecipient(f.recipientId)).grades).toEqual([]);
  });

  it('keeps private notes instructor-only and learner feedback hidden until publication', async () => {
    const f = await fixture();
    const attempt = await f.learner.submitAttempt(submission(f));
    const input = {
      recipientId: f.recipientId,
      attemptId: attempt.id,
      expectedGradeRevisionId: null,
      kind: 'scored' as const,
      criterionScores: { approach: 500, explanation: 300 },
      learnerFeedback: 'Explain why the map lookup is constant time.',
      privateNote: 'Strong solution; explanation needs precision.',
      reason: 'Manual rubric review',
      requestKey: randomUUID(),
    };
    const grade = await f.instructor.appendGrade(input);
    expect((await f.instructor.readRecipient(f.recipientId)).grades[0]).toMatchObject({
      learnerFeedback: input.learnerFeedback,
      privateNote: input.privateNote,
      criterionScores: input.criterionScores,
    });
    expect((await f.learner.readRecipient(f.recipientId)).grades).toEqual([]);
    await expect(f.instructor.appendGrade({ ...input, privateNote: 'Changed note' })).rejects.toBeInstanceOf(GradebookConflictError);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish reviewed grade', requestKey: randomUUID() });
    const visible = (await f.learner.readRecipient(f.recipientId)).grades[0];
    expect(visible).toMatchObject({ learnerFeedback: input.learnerFeedback });
    expect(visible).not.toHaveProperty('privateNote');
  });

  it('derives the manual review inbox state and scopes it to the class owner', async () => {
    const f = await fixture();
    const attempt = await f.learner.submitAttempt(submission(f));
    expect(await f.instructor.listManualReviewInbox({ classId: f.classroom.id })).toMatchObject({
      items: [expect.objectContaining({ recipientId: f.recipientId, status: 'awaiting_review', latestAttempt: expect.objectContaining({ id: attempt.id }) })],
      nextCursor: null,
    });
    const grade = await f.instructor.appendGrade({ recipientId: f.recipientId, attemptId: attempt.id, expectedGradeRevisionId: null, kind: 'scored', criterionScores: { approach: 500, explanation: 300 }, learnerFeedback: '', privateNote: '', reason: 'Manual review', requestKey: randomUUID() });
    expect((await f.instructor.listManualReviewInbox({ classId: f.classroom.id, status: 'draft' })).items[0]?.latestGrade?.id).toBe(grade.id);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish grade', requestKey: randomUUID() });
    expect((await f.instructor.listManualReviewInbox({ classId: f.classroom.id, status: 'published' })).items[0]?.status).toBe('published');
    const other = await fixture();
    await expect(other.instructor.listManualReviewInbox({ classId: f.classroom.id })).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('reads an owner-scoped class matrix without exposing response or feedback data', async () => {
    const f = await fixture();
    const result = await f.instructor.readClassGradebook(f.classroom.id);
    expect(result).toMatchObject({
      classroom: { id: f.classroom.id, name: 'Gradebook tests' },
      assignments: [{ id: f.policy.assignmentId, maxUnits: 1000, policyVersionId: f.policy.versionId }],
      learners: [
        expect.objectContaining({ membership: 'included', cells: [expect.objectContaining({ state: 'unsubmitted', earnedUnits: null })] }),
        expect.objectContaining({ membership: 'included', cells: [expect.objectContaining({ state: 'unsubmitted', earnedUnits: null })] }),
      ],
      calculationVersion: 'points-v1',
    });
    expect(result.rows.every(row => row.rank === null && row.exclusions.includes('unsubmitted'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Use a map');
    expect(JSON.stringify(result)).not.toContain('privateNote');
    await expect(f.learner.readClassGradebook(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
    const other = await fixture();
    await expect(other.instructor.readClassGradebook(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('ranks only fully published current results and invalidates a score after resubmission', async () => {
    const f = await fixture();
    const { grade } = await scored(f);
    const draft = await f.instructor.readClassGradebook(f.classroom.id);
    expect(draft.learners.find(item => item.id === f.learnerId)?.cells[0]).toMatchObject({ state: 'draft', earnedUnits: 800 });
    expect(draft.rows.find(item => item.learnerId === f.learnerId)).toMatchObject({ rank: null, exclusions: ['unpublished_grade'] });

    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish score', requestKey: randomUUID() });
    const otherRecipient = f.published.recipients.find(item => item.learnerId === f.otherLearnerId)!;
    const otherAttempt = await f.otherLearner.submitAttempt({ recipientId: otherRecipient.id, policyVersionId: f.policy.versionId,
      response: { text: 'Try every pair.', language: 'text' }, requestKey: randomUUID() });
    const otherGrade = await f.instructor.appendGrade({ recipientId: otherRecipient.id, attemptId: otherAttempt.id, expectedGradeRevisionId: null,
      kind: 'scored', criterionScores: { approach: 0, explanation: 0 }, reason: 'Reviewed response', requestKey: randomUUID() });
    await f.instructor.publishGrade({ recipientId: otherRecipient.id, gradeRevisionId: otherGrade.id, expectedPublicationSequence: 0,
      reason: 'Publish score', requestKey: randomUUID() });
    const published = await f.instructor.readClassGradebook(f.classroom.id);
    expect(published.rows.find(item => item.learnerId === f.learnerId)).toMatchObject({ rank: 1, publishedTotal: { earnedUnits: 800, possibleUnits: 1000 } });
    expect(published.rows.find(item => item.learnerId === f.otherLearnerId)).toMatchObject({ rank: 2, publishedTotal: { earnedUnits: 0, possibleUnits: 1000 } });

    await f.learner.submitAttempt(submission(f));
    const stale = await f.instructor.readClassGradebook(f.classroom.id);
    expect(stale.learners.find(item => item.id === f.learnerId)?.cells[0]).toMatchObject({ state: 'needs_review', earnedUnits: null });
    expect(stale.rows.find(item => item.learnerId === f.learnerId)).toMatchObject({ rank: null, exclusions: ['awaiting_grade'] });
  });

  it('returns only the authenticated learner published class grades and public feedback', async () => {
    const f = await fixture();
    const attempt = await f.learner.submitAttempt(submission(f));
    const grade = await f.instructor.appendGrade({ recipientId: f.recipientId, attemptId: attempt.id,
      expectedGradeRevisionId: null, kind: 'scored', criterionScores: { approach: 500, explanation: 300 },
      learnerFeedback: 'Focus on explaining the lookup invariant.', privateNote: 'Instructor-only calibration note',
      reason: 'Reviewed against published rubric', requestKey: randomUUID() });

    const draft = await f.learner.readLearnerClassGrades(f.classroom.id);
    expect(draft).toMatchObject({
      classroom: { id: f.classroom.id, name: 'Gradebook tests' },
      assignments: [{ id: f.policy.assignmentId, recipientId: f.recipientId, state: 'awaiting_publication', publishedGrade: null }],
      summary: { publishedTotal: { earnedUnits: 0, possibleUnits: 0, percentage: null }, coverage: { published: 0, applicable: 1, comparison: 1 } },
      calculationVersion: 'points-v1',
    });
    expect(JSON.stringify(draft)).not.toContain('Instructor-only calibration note');
    expect(JSON.stringify(draft)).not.toContain('Use a map');
    expect(JSON.stringify(draft)).not.toContain(grade.id);
    expect(JSON.stringify(draft)).not.toContain(attempt.id);

    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 0, reason: 'Publish score', requestKey: randomUUID() });
    const visible = await f.learner.readLearnerClassGrades(f.classroom.id);
    expect(visible.assignments[0]).toMatchObject({ state: 'published', publishedGrade: {
      earnedUnits: 800, criterionScores: { approach: 500, explanation: 300 },
      learnerFeedback: 'Focus on explaining the lookup invariant.', publishedAt: expect.any(String),
    } });
    expect(visible.summary).toEqual({ publishedTotal: { earnedUnits: 800, possibleUnits: 1000, percentage: '80.00' },
      coverage: { published: 1, applicable: 1, comparison: 1 } });
    expect(JSON.stringify(visible)).not.toContain('Instructor-only calibration note');
    expect(JSON.stringify(visible)).not.toContain(f.otherLearnerId);
    expect(visible).not.toHaveProperty('rank');
  });

  it('suppresses stale publications after a correction or resubmission', async () => {
    const f = await fixture();
    const { grade } = await scored(f);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 0, reason: 'Publish score', requestKey: randomUUID() });
    const correction = await f.instructor.appendGrade({ recipientId: f.recipientId, attemptId: grade.attemptId,
      expectedGradeRevisionId: grade.id, kind: 'scored', criterionScores: { approach: 600, explanation: 300 },
      learnerFeedback: 'Corrected but not published', privateNote: 'Do not expose', reason: 'Correct score', requestKey: randomUUID() });
    const corrected = await f.learner.readLearnerClassGrades(f.classroom.id);
    expect(corrected.assignments[0]).toMatchObject({ state: 'awaiting_publication', publishedGrade: null });
    expect(corrected.summary.publishedTotal).toEqual({ earnedUnits: 0, possibleUnits: 0, percentage: null });
    expect(JSON.stringify(corrected)).not.toContain(correction.id);
    expect(JSON.stringify(corrected)).not.toContain('Corrected but not published');

    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: correction.id,
      expectedPublicationSequence: 1, reason: 'Publish correction', requestKey: randomUUID() });
    await f.learner.submitAttempt(submission(f));
    const resubmitted = await f.learner.readLearnerClassGrades(f.classroom.id);
    expect(resubmitted.assignments[0]).toMatchObject({ state: 'needs_review', publishedGrade: null });
    expect(resubmitted.summary.publishedTotal).toEqual({ earnedUnits: 0, possibleUnits: 0, percentage: null });
  });

  it('scopes learner class grades to active enrollment and rejects other roles', async () => {
    const f = await fixture();
    await expect(f.instructor.readLearnerClassGrades(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
    const outsider = await fixture();
    await expect(outsider.learner.readLearnerClassGrades(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
    await database.query('UPDATE classrooms SET archived_at = now() WHERE id = $1', [f.classroom.id]);
    await expect(f.learner.readLearnerClassGrades(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('stores conflict-safe excusals, hides prior grades, and restores preserved history on reassignment', async () => {
    const f = await fixture();
    const { grade } = await scored(f);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 0, reason: 'Publish before excusal', requestKey: randomUUID() });
    const initial = (await f.instructor.readRecipient(f.recipientId)).applicability;
    expect(initial).toMatchObject({ sequence: 1, applicability: 'assigned' });

    const excuseInput = { recipientId: f.recipientId, expectedApplicabilityRevisionId: initial.id,
      applicability: 'excused' as const, reason: 'Approved individual accommodation', requestKey: randomUUID() };
    const excused = await f.instructor.setRecipientApplicability(excuseInput);
    expect(await f.instructor.setRecipientApplicability(excuseInput)).toEqual(excused);
    await expect(f.instructor.setRecipientApplicability({ ...excuseInput, reason: 'Changed payload' }))
      .rejects.toBeInstanceOf(GradebookConflictError);
    await expect(f.instructor.setRecipientApplicability({ ...excuseInput, requestKey: randomUUID() }))
      .rejects.toBeInstanceOf(GradebookConflictError);

    const instructorView = await f.instructor.readClassGradebook(f.classroom.id);
    expect(instructorView.learners.find(item => item.id === f.learnerId)?.cells[0]).toMatchObject({ state: 'excused', earnedUnits: null });
    expect(instructorView.rows.find(item => item.learnerId === f.learnerId)).toMatchObject({
      rank: null, publishedTotal: { earnedUnits: 0, possibleUnits: 0, percentage: null },
      coverage: { published: 0, applicable: 0, comparison: 1 }, exclusions: ['different_assignment_set'],
    });
    const learnerView = await f.learner.readLearnerClassGrades(f.classroom.id);
    expect(learnerView.assignments[0]).toMatchObject({ state: 'excused', publishedGrade: null });
    expect(learnerView.summary).toEqual({ publishedTotal: { earnedUnits: 0, possibleUnits: 0, percentage: null },
      coverage: { published: 0, applicable: 0, comparison: 1 } });
    expect(JSON.stringify(learnerView)).not.toContain(grade.id);
    expect((await f.learner.readRecipient(f.recipientId)).applicability).not.toHaveProperty('reason');
    await expect(f.learner.submitAttempt(submission(f))).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.instructor.appendGrade({ recipientId: f.recipientId, attemptId: grade.attemptId,
      expectedGradeRevisionId: grade.id, kind: 'scored', criterionScores: { approach: 600, explanation: 400 },
      reason: 'Blocked while excused', requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 1, reason: 'Blocked while excused', requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);

    const assigned = await f.instructor.setRecipientApplicability({ recipientId: f.recipientId,
      expectedApplicabilityRevisionId: excused.id, applicability: 'assigned', reason: 'Accommodation ended', requestKey: randomUUID() });
    expect(assigned).toMatchObject({ sequence: 3, applicability: 'assigned' });
    expect((await f.learner.readLearnerClassGrades(f.classroom.id)).assignments[0]).toMatchObject({
      state: 'published', publishedGrade: { earnedUnits: 800 },
    });
    const history = await database.query('SELECT applicability, reason FROM gradebook_applicability_revisions WHERE recipient_id=$1 ORDER BY sequence', [f.recipientId]);
    expect(history.rows).toEqual([
      expect.objectContaining({ applicability: 'assigned' }),
      { applicability: 'excused', reason: excuseInput.reason },
      { applicability: 'assigned', reason: 'Accommodation ended' },
    ]);
  });

  it('limits applicability changes to the owning instructor', async () => {
    const f = await fixture(), other = await fixture();
    const initial = (await f.instructor.readRecipient(f.recipientId)).applicability;
    const input = { recipientId: f.recipientId, expectedApplicabilityRevisionId: initial.id,
      applicability: 'excused' as const, reason: 'Authorized exception', requestKey: randomUUID() };
    await expect(other.instructor.setRecipientApplicability(input)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.learner.setRecipientApplicability(input)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('keeps disputed published scores visible while excluding them from ranking until resolution', async () => {
    const f = await fixture();
    const { grade } = await scored(f);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 0, reason: 'Publish reviewed score', requestKey: randomUUID() });
    const opened = await f.learner.openGradeDispute({ recipientId: f.recipientId, expectedDisputeEventId: null,
      gradeRevisionId: grade.id, reason: 'The explanation criterion does not match the rubric feedback.', requestKey: randomUUID() });
    expect(opened).toMatchObject({ sequence: 1, status: 'submitted', gradeRevisionId: grade.id });
    const disputed = await f.instructor.readClassGradebook(f.classroom.id);
    expect(disputed.rows.find(row => row.learnerId === f.learnerId)).toMatchObject({
      publishedTotal: { earnedUnits: 800, possibleUnits: 1000, percentage: '80.00' },
      rank: null, exclusions: ['disputed_grade'],
    });
    expect((await f.learner.readLearnerClassGrades(f.classroom.id)).assignments[0]).toMatchObject({
      state: 'published', publishedGrade: { earnedUnits: 800 },
    });
    const reviewing = await f.instructor.markGradeDisputeInReview({ recipientId: f.recipientId,
      expectedDisputeEventId: opened.id, reason: 'Instructor began rubric review', requestKey: randomUUID() });
    expect(reviewing).toMatchObject({ sequence: 2, status: 'in_review' });
    const resolved = await f.instructor.resolveGradeDispute({ recipientId: f.recipientId,
      expectedDisputeEventId: reviewing.id, outcome: 'upheld', replacementGradeRevisionId: null,
      reason: 'The published rubric score is supported by the submitted response.', requestKey: randomUUID() });
    expect(resolved).toMatchObject({ sequence: 3, status: 'resolved', outcome: 'upheld' });
    expect((await f.instructor.readClassGradebook(f.classroom.id)).rows.find(row => row.learnerId === f.learnerId))
      .toMatchObject({ rank: 1, exclusions: [] });
    await expect(f.learner.openGradeDispute({ recipientId: f.recipientId, expectedDisputeEventId: resolved.id,
      gradeRevisionId: grade.id, reason: 'Duplicate review request', requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await f.instructor.readRecipient(f.recipientId)).disputes).toHaveLength(3);
  });

  it('enforces dispute ownership, idempotency, and automatic supersession on a newer submission', async () => {
    const f = await fixture(), other = await fixture();
    const { grade } = await scored(f);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 0, reason: 'Publish reviewed score', requestKey: randomUUID() });
    const input = { recipientId: f.recipientId, expectedDisputeEventId: null, gradeRevisionId: grade.id,
      reason: 'Please review this published score.', requestKey: randomUUID() };
    const opened = await f.learner.openGradeDispute(input);
    expect(await f.learner.openGradeDispute(input)).toEqual(opened);
    await expect(f.learner.openGradeDispute({ ...input, reason: 'Changed retry payload' })).rejects.toBeInstanceOf(GradebookConflictError);
    await expect(f.otherLearner.openGradeDispute({ ...input, requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(other.instructor.markGradeDisputeInReview({ recipientId: f.recipientId, expectedDisputeEventId: opened.id,
      reason: 'Forged review', requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
    await f.learner.submitAttempt(submission(f));
    const history = await f.instructor.readRecipient(f.recipientId);
    expect(history.disputes.at(-1)).toMatchObject({ status: 'superseded', sequence: 2 });
    expect((await f.instructor.readClassGradebook(f.classroom.id)).rows.find(row => row.learnerId === f.learnerId)?.exclusions)
      .toEqual(['awaiting_grade']);
  });

  it('keeps a correction disputed until it is explicitly resolved as changed', async () => {
    const f = await fixture();
    const { grade, input } = await scored(f);
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id,
      expectedPublicationSequence: 0, reason: 'Publish original score', requestKey: randomUUID() });
    const opened = await f.learner.openGradeDispute({ recipientId: f.recipientId, expectedDisputeEventId: null,
      gradeRevisionId: grade.id, reason: 'Please recheck the explanation criterion.', requestKey: randomUUID() });
    const correction = await f.instructor.appendGrade({ ...input, expectedGradeRevisionId: grade.id,
      criterionScores: { approach: 600, explanation: 400 }, reason: 'Correct score after review', requestKey: randomUUID() });
    await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: correction.id,
      expectedPublicationSequence: 1, reason: 'Publish corrected score', requestKey: randomUUID() });
    expect((await f.instructor.readClassGradebook(f.classroom.id)).rows.find(row => row.learnerId === f.learnerId))
      .toMatchObject({ publishedTotal: { percentage: '100.00' }, rank: null, exclusions: ['disputed_grade'] });
    await f.instructor.resolveGradeDispute({ recipientId: f.recipientId, expectedDisputeEventId: opened.id,
      outcome: 'changed', replacementGradeRevisionId: correction.id, reason: 'The corrected published grade addresses the review.', requestKey: randomUUID() });
    expect((await f.instructor.readClassGradebook(f.classroom.id)).rows.find(row => row.learnerId === f.learnerId))
      .toMatchObject({ publishedTotal: { percentage: '100.00' }, rank: 1, exclusions: [] });
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

  it('enforces a serialized database submission budget while allowing idempotent retries', async () => {
    const f = await fixture();
    const original = submission(f, 'stable-retry');
    const first = await f.learner.submitAttempt(original);
    for (let index = 1; index < 5; index += 1) {
      await f.learner.submitAttempt(submission(f, randomUUID()));
    }
    await expect(f.learner.submitAttempt(submission(f, randomUUID()))).rejects.toMatchObject({ name: 'GradebookRateLimitError' });
    await expect(f.learner.submitAttempt(original)).resolves.toEqual(first);
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
    const policy: AssignmentGradePolicy = { ...f.policy, scoring: { mode: 'verified_completion', verifierVersionId: ASSIGNMENT_VERIFIER_VERSION } };
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
      VALUES ($1,$2,1,$3,'scored',$4,$7,'{}','Pinned verifier result',NULL,$5,$6)`;
    await expect(database.query(insert, [recipientId, policy.versionId, attempt.id, 500, randomUUID(), job!.id, ASSIGNMENT_VERIFIER_VERSION])).rejects.toMatchObject({ code: '23514' });
    await database.query(insert, [recipientId, policy.versionId, attempt.id, 1000, randomUUID(), job!.id, ASSIGNMENT_VERIFIER_VERSION]);
  });

  it('supersedes an active verification job when its recipient is excused', async () => {
    const f = await fixture(null, false);
    const policy: AssignmentGradePolicy = { ...f.policy, scoring: { mode: 'verified_completion', verifierVersionId: ASSIGNMENT_VERIFIER_VERSION } };
    const published = await f.instructor.publishPolicy({ ...f.publishInput, policy });
    const recipientId = published.recipients.find(item => item.learnerId === f.learnerId)!.id;
    const attempt = await f.learner.submitAttempt({ recipientId, policyVersionId: policy.versionId,
      response: { text: 'print(1)', language: 'python' }, requestKey: randomUUID() });
    const verifier = new PostgresGradebookVerificationRepository(database);
    const job = await verifier.claimNext();
    expect(job?.id).toBe(attempt.verificationJobId);
    const current = (await f.instructor.readRecipient(recipientId)).applicability;
    await f.instructor.setRecipientApplicability({ recipientId, expectedApplicabilityRevisionId: current.id,
      applicability: 'excused', reason: 'Approved exception during verification', requestKey: randomUUID() });
    expect(await verifier.resolve({ jobId: job!.id, leaseToken: job!.leaseToken, outcome: 'passed',
      summary: { passedTests: 1, totalTests: 1, durationMs: 5 } })).toBeNull();
    expect((await database.query('SELECT status,error_code FROM gradebook_verification_jobs WHERE id=$1', [job!.id])).rows[0])
      .toEqual({ status: 'superseded', error_code: 'recipient-excused' });
    expect((await f.instructor.readRecipient(recipientId)).grades).toEqual([]);
  });

  it('upgrades legacy class data and can reverse only the additive migration', async () => {
    const f = await fixture(null, false);
    await database.query("INSERT INTO practice_sessions (user_id, content_id, content_version, current_stage, status, session_metadata, revision) VALUES ($1, $2, 1, 'evaluate', 'completed', '{}', 1)", [f.learnerId, contentId]);
    const options = { databaseUrl: `postgresql://test:test@${migrationConfig.host}:${migrationConfig.port}/testdb`, dir: 'migrations', migrationsTable: 'pgmigrations', count: 7 };
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
      FROM pg_class WHERE relname IN ('gradebook_policies', 'gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'gradebook_publications', 'gradebook_applicability_revisions', 'gradebook_dispute_events')`);
    expect(result.rows).toHaveLength(7);
    for (const row of result.rows) expect(row).toMatchObject({ rls: true, anon: false, authenticated: false });
  });

  it('rejects updates to immutable policies, attempts, grades and publications', async () => {
    const f = await fixture(), { attempt, grade } = await scored(f);
    const publication = await f.instructor.publishGrade({ recipientId: f.recipientId, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Publish', requestKey: randomUUID() });
    const applicability = (await f.instructor.readRecipient(f.recipientId)).applicability;
    const dispute = await f.learner.openGradeDispute({ recipientId: f.recipientId, expectedDisputeEventId: null,
      gradeRevisionId: grade.id, reason: 'Immutable dispute fixture', requestKey: randomUUID() });
    for (const [table, id] of [['gradebook_policies', f.policy.versionId], ['gradebook_attempts', attempt.id], ['gradebook_grade_revisions', grade.id], ['gradebook_publications', publication.id], ['gradebook_applicability_revisions', applicability.id], ['gradebook_dispute_events', dispute.id]]) {
      await expect(database.query(`UPDATE ${table} SET id = id WHERE id = $1`, [id])).rejects.toThrow();
    }
  });
});

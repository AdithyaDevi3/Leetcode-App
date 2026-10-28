import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { freezeQuestionVersion, freezeQuizQuestionSelection, type MultipleChoiceQuizSnapshot } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresAssessmentDraftRepository, type AssessmentDraftInput } from '../src/repositories/assessment-draft.repository.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresContentRepository } from '../src/repositories/content.repository.js';
import { GradebookAccessError, PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import {
  PostgresQuizAssignmentRepository, QuizAssignmentAccessError, QuizAssignmentConflictError, QuizAssignmentValidationError,
} from '../src/repositories/quiz-assignment.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer;
let database: DatabaseClient;
let config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' })
    .withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(database);
  await runMigrations(config);
}, 60_000);
afterEach(async () => { if (database) await database.query('TRUNCATE users, classrooms CASCADE'); });
afterAll(async () => { await database?.close(); await container?.stop(); });

const hidden = /correctOptionId|explanation|misconceptionTags|provenance|reviewerId|snapshot_hash|quiz_score_id/;
function snapshot(): MultipleChoiceQuizSnapshot {
  return freezeQuizQuestionSelection(['pair-invariant', 'window-boundary'].map((questionId, index) => ({
    maxUnits: index === 0 ? 125 : 275,
    question: freezeQuestionVersion({ questionId, version: 1, versionId: `${questionId}@1`, kind: 'multiple_choice', status: 'reviewed',
      title: `Pinned reasoning question ${index + 1}`, prompt: 'Which operation preserves the invariant?', difficulty: 'foundation',
      activityIds: ['pair-with-target-v1'], conceptIds: ['hash-maps'], options: [
        { id: 'lookup', text: 'Look up the complement first.', misconceptionTags: [] },
        { id: 'insert', text: 'Insert the current item first.', misconceptionTags: ['self-match'] },
      ], correctOptionId: 'lookup', explanation: 'The map must contain earlier indices only.',
      provenance: { kind: 'original', authorId: 'synthetic-author', authoredAt: '2026-10-26T10:00:00.000Z' },
      review: { reviewerId: 'synthetic-independent-review', reviewedAt: '2026-10-26T11:00:00.000Z', notes: 'Synthetic independently attributed review.' } }),
  })));
}
async function person(role: 'instructor' | 'learner' | 'admin' = 'learner') {
  return (await database.query<{ id: string }>('INSERT INTO users (display_name,role) VALUES ($1,$2) RETURNING id', [`Synthetic ${role}`, role])).rows[0].id;
}
async function fixture(dates: Partial<Pick<AssessmentDraftInput, 'availableAt' | 'dueAt' | 'closesAt'>> = {}) {
  const instructorId = await person('instructor'), learnerId = await person(), secondId = await person();
  const classrooms = new PostgresClassroomRepository(database, instructorId);
  const classroom = await classrooms.createClass({ name: 'Frozen quiz class', description: '', actorId: instructorId, reason: 'Synthetic assessment fixture' });
  await classrooms.joinClassByCode({ userId: learnerId, code: classroom.joinCode });
  await classrooms.joinClassByCode({ userId: secondId, code: classroom.joinCode });
  const drafts = new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId: instructorId });
  const frozen = snapshot();
  const input: AssessmentDraftInput = { classId: classroom.id, title: 'Private class assessment title', instructions: 'Private class assessment instructions',
    questions: frozen.questions.map(q => ({ questionVersionId: q.question.versionId, maxUnits: q.maxUnits })), availableAt: null, dueAt: null, closesAt: null, ...dates };
  const draft = await drafts.createDraft({ draft: input, requestKey: randomUUID(), reason: 'Prepare synthetic quiz' });
  const author = new PostgresQuizAssignmentRepository(database, { role: 'instructor', userId: instructorId });
  const learner = new PostgresQuizAssignmentRepository(database, { role: 'learner', userId: learnerId });
  const teacherGrades = new PostgresGradebookRepository(database, { role: 'instructor', userId: instructorId });
  const learnerGrades = new PostgresGradebookRepository(database, { role: 'learner', userId: learnerId });
  const context = await author.readAuthorDraft(draft.id);
  const publish = { draftId: draft.id, expectedRevision: 1, expectedRosterFingerprint: context.rosterFingerprint,
    audience: { kind: 'class' as 'class' | 'selected', learnerIds: context.learners.map(p => p.id) }, snapshot: frozen, requestKey: randomUUID(), reason: 'Assign the reviewed quiz' };
  return { instructorId, learnerId, secondId, classrooms, classroom, drafts, draft, input, author, learner, teacherGrades, learnerGrades, context, publish };
}
async function assigned(dates: Parameters<typeof fixture>[0] = {}, selected = false) {
  const f = await fixture(dates);
  if (selected) f.publish.audience = { kind: 'selected', learnerIds: [f.learnerId] };
  const published = await f.author.publishDraft(f.publish);
  const recipientId = (await database.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1 AND learner_id=$2', [published.policyVersionId, f.learnerId])).rows[0].id;
  return { ...f, published, recipientId };
}
const choices = { 'pair-invariant@1': 'lookup', 'window-boundary@1': 'insert' };

describe('frozen class quizzes', () => {
  it('completes publication, cross-client resume, private scoring, explicit release, and both persisted gradebooks', async () => {
    const f = await assigned();
    expect(f.published).toMatchObject({ draftId: f.draft.id, draftRevision: 1, recipientCount: 2, audienceKind: 'class' });
    const initial = await f.learner.readLearnerQuiz(f.recipientId);
    expect(initial).toMatchObject({ isOpen: true, isClosed: false, maxUnits: 400, questionCount: 2, answerDraft: { revision: 0 }, submission: null, releasedGrade: null });
    expect(JSON.stringify(initial)).not.toMatch(hidden);
    const saved = await f.learner.saveAnswers({ recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() });
    const fresh = createDatabaseClient(config);
    try {
      const nextDevice = new PostgresQuizAssignmentRepository(fresh, { role: 'learner', userId: f.learnerId });
      expect((await nextDevice.readLearnerQuiz(f.recipientId)).answerDraft).toEqual(saved.answerDraft);
      const receipt = await nextDevice.submitQuiz({ recipientId: f.recipientId, expectedRevision: 1, requestKey: randomUUID() });
      expect(receipt).toMatchObject({ answerRevision: 1, isLate: false });
      expect(JSON.stringify(receipt)).not.toMatch(/earnedUnits|score|correct|explanation/);
      const privateReview = await f.author.readInstructorQuiz(f.recipientId);
      expect(privateReview.grade).toMatchObject({ earnedUnits: 125, criterionScores: {}, attemptId: receipt.attemptId });
      expect((await nextDevice.readLearnerQuiz(f.recipientId)).releasedGrade).toBeNull();
      expect((await f.learnerGrades.readRecipient(f.recipientId)).grades).toEqual([]);
      expect((await f.learnerGrades.readLearnerClassGrades(f.classroom.id)).assignments[0]).toMatchObject({ assignmentKind: 'quiz', state: 'awaiting_publication', publishedGrade: null });
      await f.teacherGrades.publishGrade({ recipientId: f.recipientId, gradeRevisionId: privateReview.grade!.id, expectedPublicationSequence: 0, reason: 'Release reviewed class result', requestKey: randomUUID() });
      const released = await nextDevice.readLearnerQuiz(f.recipientId);
      expect(released.releasedGrade).toMatchObject({ earnedUnits: 125, gradeRevisionId: privateReview.grade!.id });
      expect(JSON.stringify(released)).not.toMatch(hidden);
      expect((await f.learnerGrades.readLearnerClassGrades(f.classroom.id)).summary.publishedTotal).toMatchObject({ earnedUnits: 125, possibleUnits: 400, percentage: '31.25' });
      expect((await f.teacherGrades.readClassGradebook(f.classroom.id)).assignments[0].assignmentKind).toBe('quiz');
      expect((await f.teacherGrades.readClassGradebook(f.classroom.id)).learners.find(l => l.id === f.learnerId)!.cells[0]).toMatchObject({ state: 'published', earnedUnits: 125 });
      expect((await f.classrooms.listStudentAssignments(f.learnerId))[0]).toMatchObject({ assignmentKind: 'quiz', completed: true, quizStatus: 'published', recipientId: f.recipientId });
      expect((await f.classrooms.listStudentClasses(f.learnerId))[0]).toMatchObject({ assignmentCount: 1, completedCount: 1 });
      expect((await database.query('SELECT id FROM gradebook_verification_jobs')).rows).toHaveLength(0);
    } finally { await fresh.close(); }
  });

  it('freezes selected/class cohorts, excludes late joiners and unselected denominators, and preserves coding late joins', async () => {
    const f = await assigned({}, true);
    const coding = await f.classrooms.createAssignment({ classId: f.classroom.id, contentId: '10000000-0000-0000-0000-000000000001', title: 'Existing coding path', instructions: '', dueOn: null, actorId: f.instructorId, reason: 'Keep coding behavior' });
    const lateId = await person();
    await f.classrooms.joinClassByCode({ userId: lateId, code: f.classroom.joinCode });
    for (const learnerId of [f.secondId, lateId]) {
      expect((await f.classrooms.listStudentAssignments(learnerId)).map(a => a.id)).toEqual([coding]);
      expect((await f.classrooms.listStudentClasses(learnerId))[0].assignmentCount).toBe(1);
      const grades = await new PostgresGradebookRepository(database, { role: 'learner', userId: learnerId }).readLearnerClassGrades(f.classroom.id);
      expect(grades.assignments.map(a => a.id)).toEqual([coding]);
      expect(grades.summary.publishedTotal.possibleUnits).toBe(0);
    }
    const book = await f.teacherGrades.readClassGradebook(f.classroom.id);
    for (const learnerId of [f.secondId, lateId]) expect(book.learners.find(l => l.id === learnerId)!.cells.find(c => c.assignmentId === f.published.assignmentId)!.state).toBe('not_assigned');
    expect((await database.query('SELECT learner_id FROM gradebook_recipients WHERE policy_id=$1', [f.published.policyVersionId])).rows).toEqual([{ learner_id: f.learnerId }]);
    const all = await assigned();
    const allLate = await person();
    await all.classrooms.joinClassByCode({ userId: allLate, code: all.classroom.joinCode });
    expect(await all.classrooms.listStudentAssignments(allLate)).toEqual([]);
    expect((await all.classrooms.listStudentClasses(allLate))[0].assignmentCount).toBe(0);
  });

  it('serializes publication retries and replays the original receipt after draft/catalog changes without a snapshot', async () => {
    const f = await fixture();
    const results = await Promise.all([f.author.publishDraft(f.publish), f.author.publishDraft(f.publish)]);
    expect(results[1]).toEqual(results[0]);
    await f.drafts.updateDraft({ draftId: f.draft.id, expectedRevision: 1, draft: { ...f.input, title: 'Changed privately after assignment', questions: [...f.input.questions].reverse() }, requestKey: randomUUID(), reason: 'Prepare another private revision' });
    expect(await f.author.publishDraft({ ...f.publish, snapshot: undefined })).toEqual(results[0]);
    await expect(f.author.publishDraft({ ...f.publish, snapshot: undefined, reason: 'Different client command' })).rejects.toBeInstanceOf(QuizAssignmentConflictError);
    await expect(f.author.publishDraft({ ...f.publish, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'already_published' });
    const recipient = (await database.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1 LIMIT 1', [results[0].policyVersionId])).rows[0].id;
    expect((await f.author.readInstructorQuiz(recipient)).title).toBe(f.input.title);
    expect((await database.query('SELECT id FROM quiz_publications')).rows).toHaveLength(1);
  });

  it('rejects stale revisions, roster drift, duplicate audience UUIDs, and mismatched snapshots before any publication writes', async () => {
    const f = await fixture();
    await expect(f.author.publishDraft({ ...f.publish, expectedRevision: 2 })).rejects.toMatchObject({ currentRevision: 1 });
    await expect(f.author.publishDraft({ ...f.publish, audience: { kind: 'selected', learnerIds: [f.learnerId, f.learnerId.toUpperCase()] } })).rejects.toBeInstanceOf(QuizAssignmentValidationError);
    const reversed = freezeQuizQuestionSelection([...f.publish.snapshot.questions].reverse());
    await expect(f.author.publishDraft({ ...f.publish, snapshot: reversed })).rejects.toBeInstanceOf(QuizAssignmentValidationError);
    const lateId = await person();
    await f.classrooms.joinClassByCode({ userId: lateId, code: f.classroom.joinCode });
    await expect(f.author.publishDraft(f.publish)).rejects.toMatchObject({ code: 'roster_changed' });
    expect((await database.query('SELECT id FROM class_assignments')).rows).toHaveLength(0);
  });

  it('allows current class-management administrators to publish without granting private-grade scope', async () => {
    const f = await fixture(), adminId = await person();
    const admin = new PostgresQuizAssignmentRepository(database, { role: 'administrator', userId: adminId });
    await expect(admin.readAuthorDraft(f.draft.id)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await database.query("INSERT INTO administration_role_assignments (user_id,role) VALUES ($1,'content_author'),($1,'administrator')", [adminId]);
    const published = await admin.publishDraft(f.publish);
    const recipientId = (await database.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1 LIMIT 1', [published.policyVersionId])).rows[0].id;
    await expect(admin.readInstructorQuiz(recipientId)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(new PostgresGradebookRepository(database, { role: 'instructor', userId: adminId }).readRecipient(recipientId)).rejects.toBeInstanceOf(GradebookAccessError);
    await database.query("UPDATE administration_role_assignments SET revoked_at=clock_timestamp() WHERE user_id=$1 AND role='administrator'", [adminId]);
    await expect(admin.publishDraft({ ...f.publish, snapshot: undefined })).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(admin.readAuthorDraft(f.draft.id)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
  });

  it('isolates learner/class/role ownership and reauthorizes accepted receipts after withdrawal, excusal, or archiving', async () => {
    const f = await assigned(), other = await fixture();
    const save = { recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() };
    await f.learner.saveAnswers(save);
    await expect(other.author.readAuthorDraft(f.draft.id)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(other.author.readInstructorQuiz(f.recipientId)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(new PostgresQuizAssignmentRepository(database, { role: 'learner', userId: f.secondId }).readLearnerQuiz(f.recipientId)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await database.query("UPDATE users SET role='learner' WHERE id=$1", [f.instructorId]);
    await expect(f.author.readInstructorQuiz(f.recipientId)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await database.query("UPDATE users SET role='instructor' WHERE id=$1", [f.instructorId]);
    await database.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2', [f.classroom.id, f.learnerId]);
    await expect(f.learner.saveAnswers(save)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await f.classrooms.joinClassByCode({ userId: f.learnerId, code: f.classroom.joinCode });
    const ar = (await f.teacherGrades.readRecipient(f.recipientId)).applicability;
    await f.teacherGrades.setRecipientApplicability({ recipientId: f.recipientId, applicability: 'excused', expectedApplicabilityRevisionId: ar.id, reason: 'Synthetic excusal', requestKey: randomUUID() });
    await expect(f.learner.saveAnswers(save)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    expect(await f.classrooms.listStudentAssignments(f.learnerId)).toEqual([]);
    await database.query('UPDATE classrooms SET archived_at=clock_timestamp() WHERE id=$1', [f.classroom.id]);
    await expect(f.author.publishDraft(f.publish)).rejects.toBeInstanceOf(QuizAssignmentAccessError);
  });

  it('saves revisions 1 through 3, preserves old receipts with current revision, and rejects stale concurrent writes', async () => {
    const f = await assigned();
    const first = { recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() };
    const accepted = await f.learner.saveAnswers(first);
    await f.learner.saveAnswers({ ...first, expectedRevision: 1, answers: {}, requestKey: randomUUID() });
    await f.learner.saveAnswers({ ...first, expectedRevision: 2, requestKey: randomUUID() });
    expect(await f.learner.saveAnswers(first)).toEqual({ answerDraft: accepted.answerDraft, currentRevision: 3 });
    await expect(f.learner.saveAnswers({ ...first, answers: {} })).rejects.toBeInstanceOf(QuizAssignmentConflictError);
    const races = await Promise.allSettled([{}, choices].map(answers => f.learner.saveAnswers({ recipientId: f.recipientId, expectedRevision: 3, answers, requestKey: randomUUID() })));
    expect(races.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(races.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await f.learner.readLearnerQuiz(f.recipientId)).answerDraft.revision).toBe(4);
  });

  it('rejects foreign question/option/answer-bearing fields without saving any answer draft', async () => {
    const f = await assigned();
    for (const answers of [{ 'pair-invariant@2': 'lookup' }, { 'pair-invariant@1': 'missing' }, { correctOptionId: 'lookup' }, { 'pair-invariant@1': { correctOptionId: 'lookup' } }, []]) {
      await expect(f.learner.saveAnswers({ recipientId: f.recipientId, expectedRevision: 0, answers: answers as never, requestKey: randomUUID() })).rejects.toBeInstanceOf(QuizAssignmentValidationError);
    }
    expect((await database.query('SELECT recipient_id FROM quiz_answer_drafts')).rows).toHaveLength(0);
  });

  it('finalizes exactly once under races, replays its receipt, and blocks delayed autosaves or new submission keys', async () => {
    const f = await assigned();
    const savedInput = { recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() };
    await f.learner.saveAnswers(savedInput);
    const command = { recipientId: f.recipientId, expectedRevision: 1, requestKey: randomUUID() };
    const same = await Promise.all([f.learner.submitQuiz(command), f.learner.submitQuiz(command)]);
    expect(same[1]).toEqual(same[0]);
    await expect(f.learner.submitQuiz({ ...command, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'submitted' });
    await expect(f.learner.saveAnswers({ ...savedInput, expectedRevision: 1, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'submitted' });
    expect((await f.learner.saveAnswers(savedInput)).currentRevision).toBe(1);
    expect((await database.query('SELECT id FROM gradebook_attempts')).rows).toHaveLength(1);
    expect((await database.query('SELECT id FROM quiz_score_evidence')).rows).toHaveLength(1);
    expect((await database.query('SELECT id FROM gradebook_grade_revisions')).rows).toHaveLength(1);
    const newKeyRace = await assigned();
    const races = await Promise.allSettled([1, 2].map(() => newKeyRace.learner.submitQuiz({ recipientId: newKeyRace.recipientId, expectedRevision: 0, requestKey: randomUUID() })));
    expect(races.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(races.filter(r => r.status === 'rejected')).toHaveLength(1);
  });

  it('scores unanswered selections as zero and rejects generic coding/manual-grade bypasses', async () => {
    const f = await assigned();
    await expect(f.learnerGrades.submitAttempt({ recipientId: f.recipientId, policyVersionId: f.published.policyVersionId, response: { text: 'lookup', language: 'typescript' }, requestKey: randomUUID() })).rejects.toThrow('typed quiz');
    const receipt = await f.learner.submitQuiz({ recipientId: f.recipientId, expectedRevision: 0, requestKey: randomUUID() });
    expect((await f.author.readInstructorQuiz(f.recipientId)).grade!.earnedUnits).toBe(0);
    await expect(f.teacherGrades.appendGrade({ recipientId: f.recipientId, attemptId: receipt.attemptId, expectedGradeRevisionId: null, kind: 'scored', criterionScores: {}, reason: 'Forged manual score', requestKey: randomUUID() })).rejects.toThrow();
  });

  it('returns scheduled safe metadata before opening and refuses writes without exposing questions or keys', async () => {
    const f = await assigned({ availableAt: '2099-01-01T00:00:00.000Z', dueAt: '2099-01-01T01:00:00.000Z', closesAt: '2099-01-01T02:00:00.000Z' });
    expect(await f.learner.readLearnerQuiz(f.recipientId)).toMatchObject({ isOpen: false, questions: [], answerDraft: { revision: 0, answers: {} }, availableAt: '2099-01-01T00:00:00.000Z' });
    await expect(f.learner.saveAnswers({ recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() })).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(f.learner.saveAnswers({ recipientId: f.recipientId, expectedRevision: 0, answers: { 'foreign-question@1': 'missing' }, requestKey: randomUUID() })).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(f.learner.submitQuiz({ recipientId: f.recipientId, expectedRevision: 0, requestKey: randomUUID() })).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    expect((await f.author.readInstructorQuiz(f.recipientId)).questions).toHaveLength(2);
  });

  it('uses due time only for lateness and rejects closed new work while replaying accepted receipts', async () => {
    const closesAt = new Date(Date.now() + 1800).toISOString();
    const f = await assigned({ dueAt: '2020-01-01T12:00:00.000Z', closesAt });
    const save = { recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() };
    await f.learner.saveAnswers(save);
    const submit = { recipientId: f.recipientId, expectedRevision: 1, requestKey: randomUUID() };
    const receipt = await f.learner.submitQuiz(submit);
    expect(receipt.isLate).toBe(true);
    await vi.waitFor(async () => expect((await database.query<{ closed: boolean }>('SELECT clock_timestamp()>$1 AS closed', [closesAt])).rows[0].closed).toBe(true), { timeout: 5000, interval: 40 });
    expect(await f.learner.submitQuiz(submit)).toEqual(receipt);
    expect((await f.learner.saveAnswers(save)).currentRevision).toBe(1);
    await expect(f.learner.saveAnswers({ ...save, requestKey: randomUUID(), expectedRevision: 1 })).rejects.toBeInstanceOf(QuizAssignmentAccessError);
    await expect(f.learner.submitQuiz({ ...submit, requestKey: randomUUID() })).rejects.toBeInstanceOf(QuizAssignmentAccessError);
  });

  it('checks the real closing clock after waiting for another device recipient lock', async () => {
    const closesAt = new Date(Date.now() + 1400).toISOString();
    const f = await assigned({ closesAt });
    const blocker = await database.getPool().connect();
    let result: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM gradebook_recipients WHERE id=$1 FOR UPDATE', [f.recipientId]);
      result = f.learner.submitQuiz({ recipientId: f.recipientId, expectedRevision: 0, requestKey: randomUUID() }).catch(e => e);
      await vi.waitFor(async () => expect((await database.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [pid])).rows).toHaveLength(1));
      await vi.waitFor(async () => expect((await database.query<{ closed: boolean }>('SELECT clock_timestamp()>$1 AS closed', [closesAt])).rows[0].closed).toBe(true), { timeout: 5000, interval: 40 });
      await blocker.query('COMMIT');
      expect(await result).toBeInstanceOf(QuizAssignmentAccessError);
      expect((await database.query('SELECT id FROM gradebook_attempts')).rows).toHaveLength(0);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await result; }
  });

  it('rolls back attempt, score evidence, and receipt if grade persistence fails, then retries the same finalization', async () => {
    const f = await assigned();
    const command = { recipientId: f.recipientId, expectedRevision: 0, requestKey: randomUUID() };
    await database.query(`CREATE FUNCTION synthetic_reject_quiz_grade() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected grade failure'; END $$`);
    await database.query('CREATE TRIGGER synthetic_reject_quiz_grade BEFORE INSERT ON gradebook_grade_revisions FOR EACH ROW EXECUTE FUNCTION synthetic_reject_quiz_grade()');
    try {
      await expect(f.learner.submitQuiz(command)).rejects.toThrow('injected grade failure');
      expect((await database.query('SELECT id FROM gradebook_attempts')).rows).toEqual([]);
      expect((await database.query('SELECT id FROM quiz_score_evidence')).rows).toEqual([]);
      expect((await database.query("SELECT request_key FROM quiz_request_receipts WHERE operation='submit'")).rows).toEqual([]);
    } finally { await database.query('DROP TRIGGER synthetic_reject_quiz_grade ON gradebook_grade_revisions'); await database.query('DROP FUNCTION synthetic_reject_quiz_grade()'); }
    expect(await f.learner.submitQuiz(command)).toMatchObject({ answerRevision: 0 });
  });

  it('rolls back every publication side effect on audit failure and retries the same request cleanly', async () => {
    const f = await fixture();
    const countBefore = (await database.query('SELECT id FROM content_items WHERE class_private')).rows.length;
    await database.query(`CREATE FUNCTION synthetic_reject_quiz_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected publication audit failure'; END $$`);
    await database.query("CREATE TRIGGER synthetic_reject_quiz_publish BEFORE INSERT ON administration_audit_events FOR EACH ROW WHEN (NEW.action='assessments.quiz.publish') EXECUTE FUNCTION synthetic_reject_quiz_publish()");
    try {
      await expect(f.author.publishDraft(f.publish)).rejects.toThrow('injected publication audit failure');
      for (const table of ['class_assignments', 'gradebook_policies', 'gradebook_recipients', 'quiz_publications', 'quiz_request_receipts']) {
        expect((await database.query(`SELECT 1 FROM ${table}`)).rows).toEqual([]);
      }
      expect((await database.query('SELECT id FROM content_items WHERE class_private')).rows).toHaveLength(countBefore);
    } finally { await database.query('DROP TRIGGER synthetic_reject_quiz_publish ON administration_audit_events'); await database.query('DROP FUNCTION synthetic_reject_quiz_publish()'); }
    expect(await f.author.publishDraft(f.publish)).toMatchObject({ draftRevision: 1, recipientCount: 2 });
  });

  it('locks an earlier draft author before the draft when that account is deleted during publication', async () => {
    const f = await fixture(), oldAuthorId = await person();
    await database.query("INSERT INTO administration_role_assignments (user_id,role) VALUES ($1,'administrator')", [oldAuthorId]);
    const drafts = new PostgresAssessmentDraftRepository(database, { role: 'administrator', userId: oldAuthorId });
    const oldDraft = await drafts.createDraft({ draft: f.input, requestKey: randomUUID(), reason: 'Synthetic earlier draft author' });
    const context = await f.author.readAuthorDraft(oldDraft.id);
    const command = { ...f.publish, draftId: oldDraft.id, expectedRosterFingerprint: context.rosterFingerprint, requestKey: randomUUID() };
    const blocker = await database.getPool().connect();
    let result: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query("SET LOCAL lock_timeout='3s'");
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [oldAuthorId]);
      result = f.author.publishDraft(command).catch(error => error);
      await vi.waitFor(async () => expect((await database.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [pid])).rows).toHaveLength(1));
      await blocker.query('DELETE FROM administration_audit_events WHERE actor_id=$1', [oldAuthorId]);
      await blocker.query('DELETE FROM users WHERE id=$1', [oldAuthorId]);
      await blocker.query('COMMIT');
      expect(await result).toMatchObject({ draftId: oldDraft.id, draftRevision: 1 });
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await result; }
  });

  it('keeps MCQ grade release parent-first when a class is deleted concurrently', async () => {
    const f = await assigned();
    await f.learner.submitQuiz({ recipientId: f.recipientId, expectedRevision: 0, requestKey: randomUUID() });
    const review = await f.author.readInstructorQuiz(f.recipientId);
    const blocker = await database.getPool().connect();
    let result: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query("SET LOCAL lock_timeout='3s'");
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM classrooms WHERE id=$1 FOR UPDATE', [f.classroom.id]);
      result = f.teacherGrades.publishGrade({ recipientId: f.recipientId, gradeRevisionId: review.grade!.id,
        expectedPublicationSequence: 0, reason: 'Release racing class deletion', requestKey: randomUUID() }).catch(error => error);
      await vi.waitFor(async () => expect((await database.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [pid])).rows).toHaveLength(1));
      await blocker.query('DELETE FROM classrooms WHERE id=$1', [f.classroom.id]);
      await blocker.query('COMMIT');
      expect(await result).toBeInstanceOf(GradebookAccessError);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); await result; }
  });

  it('keeps generic content APIs and permissive browser reads from exposing class-specific content or private snapshots', async () => {
    const f = await assigned();
    const source = (await database.query<{ content_id: string; content_version_id: string }>('SELECT a.content_id,p.content_version_id FROM class_assignments a JOIN gradebook_policies p ON p.assignment_id=a.id WHERE a.id=$1', [f.published.assignmentId])).rows[0];
    const content = new PostgresContentRepository(database);
    expect(await content.findById(source.content_id)).toBeNull();
    expect(await content.findBySlug(`class-quiz-${source.content_id}`)).toBeNull();
    expect(await content.getLatestVersion(source.content_id)).toBeNull();
    expect(await content.getVersion(source.content_id, 1)).toBeNull();
    expect((await content.findAll()).some(i => i.id === source.content_id)).toBe(false);
    const generic = (await database.query('SELECT * FROM content_versions WHERE id=$1', [source.content_version_id])).rows[0];
    expect(JSON.stringify(generic)).not.toMatch(/Private class|Pinned reasoning|correctOptionId|explanation/);
    await database.transaction(async client => {
      await client.query('GRANT SELECT ON content_items,content_versions TO anon,authenticated');
      await client.query('CREATE POLICY synthetic_public_items ON content_items FOR SELECT TO anon,authenticated USING (true)');
      await client.query('CREATE POLICY synthetic_public_versions ON content_versions FOR SELECT TO anon,authenticated USING (true)');
      await client.query('SET LOCAL ROLE anon');
      expect((await client.query('SELECT id FROM content_items WHERE id=$1', [source.content_id])).rows).toEqual([]);
      expect((await client.query('SELECT id FROM content_versions WHERE id=$1', [source.content_version_id])).rows).toEqual([]);
      expect((await client.query('SELECT id FROM content_items WHERE NOT class_private')).rows.length).toBeGreaterThan(0);
      await client.query('RESET ROLE');
      await client.query('DROP POLICY synthetic_public_items ON content_items');
      await client.query('DROP POLICY synthetic_public_versions ON content_versions');
      await client.query('REVOKE SELECT ON content_items,content_versions FROM anon,authenticated');
    });
    for (const table of ['quiz_publications', 'quiz_answer_drafts', 'quiz_score_evidence', 'quiz_request_receipts']) {
      const flags = (await database.query<{ relrowsecurity: boolean; can_select: boolean; can_insert: boolean }>(`SELECT relrowsecurity,
        has_table_privilege('authenticated',oid,'SELECT') AS can_select,has_table_privilege('anon',oid,'INSERT') AS can_insert FROM pg_class WHERE relname=$1`, [table])).rows[0];
      expect(flags).toEqual({ relrowsecurity: true, can_select: false, can_insert: false });
    }
  });

  it('enforces immutable publication/score/receipt history and rejects forged score lineage at the database boundary', async () => {
    const f = await assigned();
    const receipt = await f.learner.submitQuiz({ recipientId: f.recipientId, expectedRevision: 0, requestKey: randomUUID() });
    await expect(database.query("UPDATE quiz_publications SET title='Tampered' WHERE id=$1", [f.published.id])).rejects.toThrow('immutable');
    await expect(database.query('UPDATE quiz_score_evidence SET earned_units=400 WHERE attempt_id=$1', [receipt.attemptId])).rejects.toThrow('immutable');
    await expect(database.query("UPDATE quiz_request_receipts SET response='{}' WHERE operation='submit'")).rejects.toThrow('immutable');
    await expect(database.transaction(async client => {
      await client.query('DELETE FROM quiz_score_evidence WHERE attempt_id=$1', [receipt.attemptId]);
    })).rejects.toMatchObject({ code: '23503' });
    await expect(database.query('DELETE FROM assessment_drafts WHERE id=$1', [f.draft.id])).rejects.toMatchObject({ code: '23503' });
    expect((await f.author.readInstructorQuiz(f.recipientId)).grade).toMatchObject({ attemptId: receipt.attemptId, earnedUnits: 0 });
    await expect(database.query(`INSERT INTO gradebook_grade_revisions (recipient_id,policy_id,sequence,attempt_id,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key)
      VALUES ($1,$2,2,$3,'scored',400,'multiple-choice-v1','{}','Forged human MCQ score',$4,'forged-grade')`, [f.recipientId, f.published.policyVersionId, receipt.attemptId, f.instructorId])).rejects.toThrow('provenance');
    await expect(database.query('INSERT INTO quiz_answer_drafts (recipient_id,policy_id,revision,answers) VALUES ($1,$2,1,$3)', [f.recipientId, f.published.policyVersionId, JSON.stringify({ 'pair-invariant@1': null, 'window-boundary@1': null })])).rejects.toThrow('finalized');
  });

  it('detects a missing recipient inside the frozen audience instead of silently treating it as unassigned', async () => {
    const f = await assigned({}, true);
    await database.query('DELETE FROM gradebook_recipients WHERE id=$1', [f.recipientId]);
    await expect(f.teacherGrades.readClassGradebook(f.classroom.id)).rejects.toThrow('recipient is missing');
    await expect(f.learnerGrades.readLearnerClassGrades(f.classroom.id)).rejects.toThrow('recipient is missing');
  });

  it('refuses a destructive downgrade once a class quiz has been persisted', async () => {
    const f = await assigned();
    await expect(runner({ databaseUrl: `postgresql://test:test@${config.host}:${config.port}/testdb`,
      dir: 'migrations', migrationsTable: 'pgmigrations', count: 1, direction: 'down' })).rejects.toThrow('forward-only');
    expect((await f.author.readAuthorDraft(f.draft.id)).publication).toEqual(f.published);
    expect((await f.learner.readLearnerQuiz(f.recipientId)).questionCount).toBe(2);
  });

  it('restores published quizzes, saved answers, final scores, release history, and retry receipts from an isolated logical backup', async () => {
    const f = await assigned({}, true);
    const save = { recipientId: f.recipientId, expectedRevision: 0, answers: choices, requestKey: randomUUID() };
    const saved = await f.learner.saveAnswers(save);
    const submit = { recipientId: f.recipientId, expectedRevision: 1, requestKey: randomUUID() };
    const receipt = await f.learner.submitQuiz(submit);
    const review = await f.author.readInstructorQuiz(f.recipientId);
    const release = { recipientId: f.recipientId, gradeRevisionId: review.grade!.id, expectedPublicationSequence: 0, reason: 'Release isolated backup result', requestKey: randomUUID() };
    const released = await f.teacherGrades.publishGrade(release);
    const expected = await f.learner.readLearnerQuiz(f.recipientId);
    const dump = await container.exec(['pg_dump', '-U', 'test', '-d', 'testdb', '--format=custom', '--no-owner', '--file=/tmp/quiz-recovery.dump']);
    expect(dump.exitCode, dump.output).toBe(0);
    await database.query('CREATE DATABASE quiz_recovery_restore');
    const restore = await container.exec(['pg_restore', '-U', 'test', '-d', 'quiz_recovery_restore', '--no-owner', '--exit-on-error', '/tmp/quiz-recovery.dump']);
    expect(restore.exitCode, restore.output).toBe(0);
    const restored = createDatabaseClient({ ...config, database: 'quiz_recovery_restore' });
    try {
      const learner = new PostgresQuizAssignmentRepository(restored, { role: 'learner', userId: f.learnerId });
      const instructor = new PostgresQuizAssignmentRepository(restored, { role: 'instructor', userId: f.instructorId });
      expect(await learner.readLearnerQuiz(f.recipientId)).toEqual(expected);
      expect(await learner.saveAnswers(save)).toEqual({ answerDraft: saved.answerDraft, currentRevision: 1 });
      expect(await learner.submitQuiz(submit)).toEqual(receipt);
      expect(await instructor.publishDraft({ ...f.publish, snapshot: undefined })).toEqual(f.published);
      const grades = new PostgresGradebookRepository(restored, { role: 'instructor', userId: f.instructorId });
      expect(await grades.publishGrade(release)).toEqual(released);
      expect((await grades.readClassGradebook(f.classroom.id)).learners.find(l => l.id === f.learnerId)!.cells[0]).toMatchObject({ earnedUnits: 125, state: 'published' });
      const flags = await restored.query(`SELECT relrowsecurity AS rls, has_table_privilege('authenticated',oid,'SELECT') AS readable FROM pg_class WHERE relname='quiz_score_evidence'`);
      expect(flags.rows).toEqual([{ rls: true, readable: false }]);
    } finally { await restored.close(); }
  });
});

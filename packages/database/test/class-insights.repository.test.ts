import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { freezeQuestionVersion, freezeQuizQuestionSelection, scoreMultipleChoiceQuiz, type MultipleChoiceQuizSnapshot, type QuestionVersion } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { ClassInsightsAccessError, PostgresClassInsightsRepository } from '../src/repositories/class-insights.repository.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresAssessmentDraftRepository } from '../src/repositories/assessment-draft.repository.js';
import { PostgresQuizAssignmentRepository } from '../src/repositories/quiz-assignment.repository.js';
import { GradebookAccessError, PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import { PostgresPracticeDiagnosticRepository } from '../src/repositories/practice-diagnostic.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer, database: DatabaseClient, config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine').withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' }).withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = createDatabaseClient(config); await prepareSupabaseTestDatabase(database); await runMigrations(config);
}, 60_000);
afterEach(async () => { await database?.query('TRUNCATE users,classrooms,content_items CASCADE'); });
afterAll(async () => { await database?.close(); await container?.stop(); });
const person = async (role = 'learner') => (await database.query<{ id: string }>('INSERT INTO users(display_name,role) VALUES($1,$2) RETURNING id', [`Synthetic ${role}`, role])).rows[0].id;
const concepts = ['hash-maps', 'recurrence', 'trees'];
const insight = (userId: string, role: 'instructor' | 'administrator' = 'instructor') => new PostgresClassInsightsRepository(database, { userId, role, conceptIds: concepts });
const question = (questionId = 'synthetic-invariant', conceptIds = ['hash-maps'], version = 1, activityId = 'synthetic-activity'): QuestionVersion => freezeQuestionVersion({
  questionId, version, versionId: `${questionId}@${version}`, kind: 'multiple_choice', status: 'reviewed', title: 'PRIVATE synthetic title', prompt: 'PRIVATE synthetic prompt', difficulty: 'foundation',
  activityIds: [activityId], conceptIds, options: [{ id: 'yes', text: 'PRIVATE correct text', misconceptionTags: [] }, { id: 'no', text: 'PRIVATE wrong text', misconceptionTags: ['private-misconception'] }],
  correctOptionId: 'yes', explanation: 'PRIVATE answer explanation', provenance: { kind: 'original', authorId: 'private-author', authoredAt: '2026-10-26T10:00:00.000Z' },
  review: { reviewerId: 'private-reviewer', reviewedAt: '2026-10-26T11:00:00.000Z', notes: 'PRIVATE review note' },
});
async function classroom(size = 1) {
  const instructorId = await person('instructor');
  const classes = new PostgresClassroomRepository(database, instructorId);
  const room = await classes.createClass({ name: 'Synthetic class', description: '', actorId: instructorId, reason: 'Synthetic class insights test' });
  const learners: string[] = [];
  for (let index = 0; index < size; index++) { const id = await person(); learners.push(id); await classes.joinClassByCode({ userId: id, code: room.joinCode }); }
  return { room, instructorId, learners, classes, repo: insight(instructorId), grades: new PostgresGradebookRepository(database, { role: 'instructor', userId: instructorId }) };
}
type Room = Awaited<ReturnType<typeof classroom>>;
async function assign(f: Room, questions = [question()], closesAt: string | null = null) {
  const snapshot = freezeQuizQuestionSelection(questions.map(question => ({ question, maxUnits: 500 })));
  const draft = await new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId: f.instructorId }).createDraft({
    draft: { classId: f.room.id, title: 'PRIVATE class quiz title', instructions: 'PRIVATE class instructions', questions: questions.map(question => ({ questionVersionId: question.versionId, maxUnits: 500 })), availableAt: null, dueAt: null, closesAt },
    requestKey: randomUUID(), reason: 'Synthetic class quiz' });
  const author = new PostgresQuizAssignmentRepository(database, { role: 'instructor', userId: f.instructorId });
  const context = await author.readAuthorDraft(draft.id);
  const publication = await author.publishDraft({ draftId: draft.id, expectedRevision: 1, expectedRosterFingerprint: context.rosterFingerprint, audience: { kind: 'class', learnerIds: context.learners.map(learner => learner.id) }, snapshot, requestKey: randomUUID(), reason: 'Synthetic explicit assignment' });
  const recipients = (await database.query<{ id: string; learner_id: string }>('SELECT id,learner_id FROM gradebook_recipients WHERE policy_id=$1 ORDER BY learner_id', [publication.policyVersionId])).rows;
  return { publication, recipients, snapshot, author };
}
type Assigned = Awaited<ReturnType<typeof assign>>;
async function submit(f: Room, assigned: Assigned, learnerId = f.learners[0], choices: Record<string, string | null> = {}, release = true) {
  const recipient = assigned.recipients.find(recipient => recipient.learner_id === learnerId)!;
  const learner = new PostgresQuizAssignmentRepository(database, { role: 'learner', userId: learnerId });
  const answers = Object.fromEntries(assigned.snapshot.questions.map(item => [item.question.versionId, Object.hasOwn(choices, item.question.versionId) ? choices[item.question.versionId] : 'no']));
  await learner.saveAnswers({ recipientId: recipient.id, expectedRevision: 0, answers, requestKey: randomUUID() });
  const submitted = await learner.submitQuiz({ recipientId: recipient.id, expectedRevision: 1, requestKey: randomUUID() });
  const grade = (await assigned.author.readInstructorQuiz(recipient.id)).grade!;
  if (release) await f.grades.publishGrade({ recipientId: recipient.id, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Synthetic explicit release', requestKey: randomUUID() });
  return { recipient, grade, submitted };
}
const hash = (result: Awaited<ReturnType<PostgresClassInsightsRepository['read']>>) => result.report.concepts.find(concept => concept.conceptId === 'hash-maps')!;

describe('eligible class concept insights', () => {
  it('reads only current-owner class metadata without consulting any assessment facts', async () => {
    const f = await classroom();
    expect(await f.repo.readClassroom(f.room.id)).toEqual({ id: f.room.id, name: f.room.name });
    const result = await f.repo.read(f.room.id);
    expect(result.report).toMatchObject({ algorithmVersion: 'class-insights-v1', view: 'owner', rosterCount: 1 });
    expect(result.report.concepts.map(concept => concept.conceptId)).toEqual(concepts);
    expect(result.report.concepts.every(concept => concept.coverageStatus === 'unknown')).toBe(true);
  });

  it('excludes drafts/unreleased results and uses frozen answers without exposing any private evidence', async () => {
    const f = await classroom(2), quiz = await assign(f);
    const submitted = await submit(f, quiz, f.learners[0], { 'synthetic-invariant@1': 'yes' }, false);
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(0);
    await f.grades.publishGrade({ recipientId: submitted.recipient.id, gradeRevisionId: submitted.grade.id, expectedPublicationSequence: 0, reason: 'Synthetic explicit release', requestKey: randomUUID() });
    const result = await f.repo.read(f.room.id);
    expect(hash(result)).toMatchObject({ answeredItems: 1, correctItems: 1, coveredLearners: 1, distinctQuestions: 1, coveragePercent: 50, coverageStatus: 'limited' });
    expect(result.assignedQuestionIds).toEqual(['synthetic-invariant']);
    const body = JSON.stringify(result.report);
    for (const marker of ['PRIVATE', 'learnerId', 'questionId', 'sourceId', 'snapshot', 'correctOptionId', 'private-misconception', ...f.learners]) expect(body).not.toContain(marker);
  });

  it('deduplicates answered logical versions and keeps earlier evidence when a later copy is skipped', async () => {
    const f = await classroom(), first = await assign(f);
    await submit(f, first);
    const second = await assign(f, [question('synthetic-invariant', ['hash-maps'], 2)]);
    await submit(f, second, f.learners[0], { 'synthetic-invariant@2': 'yes' });
    const third = await assign(f, [question('synthetic-invariant', ['hash-maps'], 3)]);
    await submit(f, third, f.learners[0], { 'synthetic-invariant@3': null });
    expect(hash(await f.repo.read(f.room.id))).toMatchObject({ answeredItems: 1, correctItems: 1, distinctQuestions: 1, coveredLearners: 1 });
  });

  it('updates eligibility immediately after excusal, reassignment, withdrawal and re-enrollment', async () => {
    const f = await classroom(), quiz = await assign(f), submitted = await submit(f, quiz);
    const original = (await f.grades.readRecipient(submitted.recipient.id)).applicability;
    const excused = await f.grades.setRecipientApplicability({ recipientId: submitted.recipient.id, applicability: 'excused', expectedApplicabilityRevisionId: original.id, reason: 'Synthetic excusal', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(0);
    await f.grades.setRecipientApplicability({ recipientId: submitted.recipient.id, applicability: 'assigned', expectedApplicabilityRevisionId: excused.id, reason: 'Synthetic reassignment', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(1);
    await database.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2', [f.room.id, f.learners[0]]);
    expect((await f.repo.read(f.room.id)).report.rosterCount).toBe(0); expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(0);
    await f.classes.joinClassByCode({ userId: f.learners[0], code: f.room.joinCode });
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(1);
  });

  it('suspends active disputes and restores an upheld released result', async () => {
    const f = await classroom(), quiz = await assign(f), submitted = await submit(f, quiz);
    const learnerGrades = new PostgresGradebookRepository(database, { role: 'learner', userId: f.learners[0] });
    const dispute = await learnerGrades.openGradeDispute({ recipientId: submitted.recipient.id, expectedDisputeEventId: null, gradeRevisionId: submitted.grade.id, reason: 'Synthetic grade review request', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(0);
    const review = await f.grades.markGradeDisputeInReview({ recipientId: submitted.recipient.id, expectedDisputeEventId: dispute.id, reason: 'Synthetic review started', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(0);
    await f.grades.resolveGradeDispute({ recipientId: submitted.recipient.id, expectedDisputeEventId: review.id, outcome: 'upheld', replacementGradeRevisionId: null, reason: 'Synthetic review upheld', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id)).answeredItems).toBe(1);
  });

  it('does not treat a released missing-work zero as an answered conceptual failure', async () => {
    const f = await classroom(), quiz = await assign(f, [question()], '2020-01-01T00:00:00.000Z'), recipient = quiz.recipients[0];
    const grade = await f.grades.appendGrade({ recipientId: recipient.id, attemptId: null, expectedGradeRevisionId: null, kind: 'missing_zero', criterionScores: {}, reason: 'Synthetic explicit missing-work decision', requestKey: randomUUID() });
    await f.grades.publishGrade({ recipientId: recipient.id, gradeRevisionId: grade.id, expectedPublicationSequence: 0, reason: 'Synthetic missing-work release', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id))).toMatchObject({ answeredItems: 0, correctItems: 0, observedCorrectPercent: null, coverageStatus: 'unknown' });
  });

  it('never reads personal diagnostics, practice history, projections or personalization consent for class assessment statistics', async () => {
    const f = await classroom(), quiz = await assign(f); await submit(f, quiz);
    const diagnosticQuestions = Array.from({ length: 10 }, (_, index) => question(`private-diagnostic-${index}`, ['trees'], 1, `synthetic-activity-${index}`));
    const diagnostic = new PostgresPracticeDiagnosticRepository(database, f.learners[0], { questions: diagnosticQuestions, activityIds: diagnosticQuestions.map(item => item.activityIds[0]) });
    const work = await diagnostic.start(); await diagnostic.save(work.id, { expectedRevision: 0, answers: { 'private-diagnostic-0@1': 'yes' }, requestKey: randomUUID() }); await diagnostic.submit(work.id, { expectedRevision: 1, requestKey: randomUUID() });
    await database.query(`INSERT INTO learner_profiles(user_id,goal,experience,preferred_language,weekly_minutes,timezone,personalization_opt_out)
      VALUES($1,'interview','beginner','typescript',60,'UTC',true)`, [f.learners[0]]);
    await database.query(`INSERT INTO learning_evidence_sources(user_id,source_kind,source_id,source_revision,observations)
      VALUES($1,'practice',$2,'synthetic-forged-projection',$3)`, [f.learners[0], randomUUID(), JSON.stringify([{ logicalItemId: 'private-practice', conceptId: 'trees', score: 100 }])]);
    const result = await f.repo.read(f.room.id);
    expect(hash(result).answeredItems).toBe(1); expect(result.report.concepts.find(concept => concept.conceptId === 'trees')?.answeredItems).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/private-diagnostic|private-practice|synthetic-forged-projection/);
  });

  it('pins the latest eligible publication, instead of an unpublished newer correction or unrelated source', async () => {
    const f = await classroom(), first = await assign(f); await submit(f, first);
    const newer = await assign(f, [question('synthetic-invariant', ['hash-maps'], 2)]);
    const submitted = await submit(f, newer, f.learners[0], { 'synthetic-invariant@2': 'yes' }, false);
    expect(hash(await f.repo.read(f.room.id))).toMatchObject({ correctItems: 0, answeredItems: 1 });
    await f.grades.publishGrade({ recipientId: submitted.recipient.id, gradeRevisionId: submitted.grade.id, expectedPublicationSequence: 0, reason: 'Synthetic correction release', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id))).toMatchObject({ correctItems: 1, answeredItems: 1 });
  });

  it('recomputes correctness from frozen answers even if a trusted capture stores inconsistent per-item JSON', async () => {
    const f = await classroom(), quiz = await assign(f), recipient = quiz.recipients[0];
    const answers = { 'synthetic-invariant@1': 'yes' };
    await new PostgresQuizAssignmentRepository(database, { role: 'learner', userId: f.learners[0] }).saveAnswers({ recipientId: recipient.id, expectedRevision: 0, answers, requestKey: randomUUID() });
    const score = scoreMultipleChoiceQuiz(quiz.snapshot, answers);
    const forged = { ...score, items: score.items.map(item => ({ ...item, correct: false, earnedUnits: 0, selectedOptionId: 'no' })) };
    const gradeId = await database.transaction(async client => {
      const attemptId = randomUUID();
      await client.query(`INSERT INTO gradebook_attempts(id,recipient_id,policy_id,response_revision_id,sequence,response,request_key)
        VALUES($1,$2,$3,$4,1,$5,$6)`, [attemptId, recipient.id, quiz.publication.policyVersionId, randomUUID(), { kind: 'multiple_choice', answers }, randomUUID()]);
      const evidence = (await client.query<{ id: string }>(`INSERT INTO quiz_score_evidence(attempt_id,recipient_id,policy_id,publication_id,answer_revision,scoring_version,snapshot_hash,response_hash,earned_units,max_units,result)
        SELECT a.id,a.recipient_id,a.policy_id,q.id,1,'multiple-choice-v1',q.snapshot_hash,encode(sha256(convert_to(a.response::text,'UTF8')),'hex'),$3,$4,$5
        FROM gradebook_attempts a JOIN quiz_publications q ON q.policy_id=a.policy_id WHERE a.id=$1 AND q.id=$2 RETURNING id`, [attemptId, quiz.publication.id, score.earnedUnits, score.maxUnits, forged])).rows[0];
      return (await client.query<{ id: string }>(`INSERT INTO gradebook_grade_revisions(recipient_id,policy_id,sequence,attempt_id,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key,quiz_score_id)
        VALUES($1,$2,1,$3,'scored',$4,'multiple-choice-v1','{}','Synthetic capture regression',NULL,$5,$6) RETURNING id`, [recipient.id, quiz.publication.policyVersionId, attemptId, score.earnedUnits, randomUUID(), evidence.id])).rows[0].id;
    });
    await f.grades.publishGrade({ recipientId: recipient.id, gradeRevisionId: gradeId, expectedPublicationSequence: 0, reason: 'Synthetic explicit release', requestKey: randomUUID() });
    expect(hash(await f.repo.read(f.room.id))).toMatchObject({ answeredItems: 1, correctItems: 1, observedCorrectPercent: 100 });
  });
});

describe('class insights authorization and administrative aggregation', () => {
  it('denies guests/learners/unrelated instructors and forged admin scopes for both reads', async () => {
    const f = await classroom(), stranger = await person('instructor'), learner = f.learners[0], legacyAdmin = await person('admin');
    for (const repo of [insight(stranger), insight(learner), insight(randomUUID()), insight(legacyAdmin), insight(legacyAdmin, 'administrator'), insight(f.instructorId, 'administrator')]) {
      await expect(repo.readClassroom(f.room.id)).rejects.toBeInstanceOf(ClassInsightsAccessError);
      await expect(repo.read(f.room.id)).rejects.toBeInstanceOf(ClassInsightsAccessError);
    }
    await expect(f.repo.read('invalid')).rejects.toBeInstanceOf(ClassInsightsAccessError);
  });

  it('checks current role assignments and archived class state instead of trusting a prior principal', async () => {
    const f = await classroom(), administrator = await person('admin');
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [administrator]);
    const repo = insight(administrator, 'administrator'); expect((await repo.read(f.room.id)).report.view).toBe('administrator');
    await database.query('UPDATE administration_role_assignments SET revoked_at=clock_timestamp() WHERE user_id=$1', [administrator]);
    await expect(repo.read(f.room.id)).rejects.toBeInstanceOf(ClassInsightsAccessError);
    await database.query("UPDATE users SET role='learner' WHERE id=$1", [f.instructorId]);
    await expect(f.repo.read(f.room.id)).rejects.toBeInstanceOf(ClassInsightsAccessError);
    await database.query("UPDATE users SET role='instructor' WHERE id=$1", [f.instructorId]);
    await database.query('UPDATE classrooms SET archived_at=clock_timestamp() WHERE id=$1', [f.room.id]);
    await expect(f.repo.readClassroom(f.room.id)).rejects.toBeInstanceOf(ClassInsightsAccessError);
    await expect(f.repo.read(f.room.id)).rejects.toBeInstanceOf(ClassInsightsAccessError);
  });

  it('suppresses administrative concepts below five distinct answered learners without granting individual grade access', async () => {
    const f = await classroom(5), quiz = await assign(f), administrator = await person('admin');
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [administrator]);
    const repo = insight(administrator, 'administrator');
    for (const learner of f.learners.slice(0, 4)) await submit(f, quiz, learner);
    expect(hash(await repo.read(f.room.id))).toEqual({ conceptId: 'hash-maps', coverageStatus: 'suppressed', answeredItems: null, correctItems: null, coveredLearners: null, distinctQuestions: null, observedCorrectPercent: null, coveragePercent: null });
    const final = await submit(f, quiz, f.learners[4], { 'synthetic-invariant@1': 'yes' });
    expect(hash(await repo.read(f.room.id))).toMatchObject({ coverageStatus: 'limited', answeredItems: 5, correctItems: 1, coveredLearners: 5, observedCorrectPercent: 20 });
    await expect(new PostgresGradebookRepository(database, { role: 'instructor', userId: administrator }).readRecipient(final.recipient.id)).rejects.toBeInstanceOf(GradebookAccessError);
    expect((await repo.readClassroom(f.room.id)).id).toBe(f.room.id);
  });
});

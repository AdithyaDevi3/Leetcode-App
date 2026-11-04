import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { freezeQuestionVersion, freezeQuizQuestionSelection } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { GradebookAccessError, GradebookConflictError, PostgresGradebookRepository, type GradebookPrincipal } from '../src/repositories/gradebook.repository.js';
import { PostgresClassGradeReleaseRepository, GradeReleaseValidationError } from '../src/repositories/class-grade-release.repository.js';
import type { PublishAssignmentGradesInput, PublishClassResultsInput } from '../src/repositories/class-grade-release.types.js';
import { PostgresAssessmentDraftRepository } from '../src/repositories/assessment-draft.repository.js';
import { PostgresQuizAssignmentRepository } from '../src/repositories/quiz-assignment.repository.js';
import { PostgresWrittenAssessmentRepository } from '../src/repositories/written-assessment.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer, db: DatabaseClient, config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine').withEnvironment({ POSTGRES_USER: 'test',POSTGRES_PASSWORD: 'test',POSTGRES_DB: 'testdb' }).withExposedPorts(5432).start();
  config = { host: container.getHost(),port: container.getMappedPort(5432),database: 'testdb',user: 'test',password: 'test' };
  db = createDatabaseClient(config); await prepareSupabaseTestDatabase(db); await runMigrations(config);
}, 60_000);
afterEach(async () => { if (db) await db.query('TRUNCATE users,classrooms CASCADE'); });
afterAll(async () => { await db?.close(); await container?.stop(); });
const principal = (userId: string,role: GradebookPrincipal['role'] = 'instructor') => ({ userId,role });
const releaseRepository = (userId: string,role: GradebookPrincipal['role'] = 'instructor') => new PostgresClassGradeReleaseRepository(db,principal(userId,role));
const gradeRepository = (userId: string,role: GradebookPrincipal['role'] = 'instructor') => new PostgresGradebookRepository(db,principal(userId,role));
async function person(role = 'learner') {
  return (await db.query<{ id: string }>('INSERT INTO users(display_name,email,role) VALUES($1,$2,$3) RETURNING id', [`Synthetic ${role}`,`${randomUUID()}@example.invalid`,role])).rows[0].id;
}
async function fixture() {
  const owner = await person('instructor'), first = await person(), second = await person(), classes = new PostgresClassroomRepository(db,owner);
  const classroom = await classes.createClass({ name: 'Synthetic grade release class',description: '',actorId: owner,reason: 'Synthetic release fixture' });
  for (const userId of [first,second]) await classes.joinClassByCode({ userId,code: classroom.joinCode });
  const assignmentId = await classes.createAssignment({ classId: classroom.id,contentId: '10000000-0000-0000-0000-000000000001',title: 'Reviewed class practice',instructions: 'Explain your reasoning.',dueOn: null,actorId: owner,reason: 'Assign synthetic reviewed practice' });
  const recipients = (await db.query<{ id: string; learner_id: string; policy_id: string }>(`SELECT r.id,r.learner_id,r.policy_id FROM gradebook_recipients r
    JOIN gradebook_policies p ON p.id=r.policy_id WHERE p.assignment_id=$1 ORDER BY r.learner_id`, [assignmentId])).rows;
  const repo = releaseRepository(owner), teacher = gradeRepository(owner);
  return { owner,first,second,classes,classroom,assignmentId,recipients,repo,teacher };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function grade(f: Fixture,learnerId = f.first) {
  const recipient = f.recipients.find(row => row.learner_id === learnerId)!;
  const learner = gradeRepository(learnerId,'learner');
  const attempt = await learner.submitAttempt({ recipientId: recipient.id,policyVersionId: recipient.policy_id,response: { text: `Saved response for ${learnerId}`,language: 'python' },requestKey: randomUUID() });
  const input = { recipientId: recipient.id,attemptId: attempt.id,expectedGradeRevisionId: null,kind: 'scored' as const,
    criterionScores: { approach: 3000,correctness: 3500,communication: 1500 },learnerFeedback: 'Private learner feedback',privateNote: 'Secret instructor note',reason: 'Review submitted response',requestKey: randomUUID() };
  return { recipient,attempt,input,grade: await f.teacher.appendGrade(input) };
}
async function releaseInput(f: Fixture): Promise<PublishAssignmentGradesInput> {
  const preview = await f.repo.readAssignment(f.classroom.id,f.assignmentId);
  return { classId: f.classroom.id,assignmentId: f.assignmentId,targets: preview.roster.flatMap(row => row.releaseTarget ? [row.releaseTarget] : []),requestKey: randomUUID(),reason: 'Release reviewed assignment grades' };
}
async function shareInput(f: Fixture): Promise<PublishClassResultsInput> {
  const preview = await f.repo.readAssignment(f.classroom.id,f.assignmentId);
  return { classId: f.classroom.id,assignmentId: f.assignmentId,targets: preview.roster.flatMap(row => row.shareTarget ? [row.shareTarget] : []),
    expectedSharingSequence: preview.sharing?.sequence ?? 0,requestKey: randomUUID(),reason: 'Explicitly share reviewed named results and submitted answers' };
}
async function releasedFixture() {
  const f = await fixture(), saved = await grade(f); await f.repo.publishAssignmentGrades(await releaseInput(f)); return { ...f,saved };
}

describe('assignment release and separately shared class results', () => {
  it('shows a complete metadata-only roster and keeps unanswered work distinct from zero', async () => {
    const f = await fixture(), saved = await grade(f), preview = await f.repo.readAssignment(f.classroom.id,f.assignmentId);
    expect(preview.roster).toHaveLength(2);
    expect(preview.roster.find(row => row.learner.id === f.first)).toMatchObject({ state: 'draft',earnedUnits: 8000,ready: true,
      response: { attemptId: saved.attempt.id,text: null,language: null,answers: {} },releaseTarget: { gradeRevisionId: saved.grade.id,expectedPublicationSequence: 0 } });
    expect(preview.roster.find(row => row.learner.id === f.second)).toMatchObject({ state: 'unsubmitted',earnedUnits: null,ready: false,releaseTarget: null });
    expect(JSON.stringify(preview)).not.toContain(`Saved response for ${f.first}`);
    expect(JSON.stringify(preview)).not.toMatch(/Secret instructor note|Private learner feedback|solution_code|test_cases/);
    const detail = await f.repo.readResponseDetail(f.classroom.id,saved.recipient.id);
    expect(detail.response?.text).toBe(`Saved response for ${f.first}`);
    expect(detail.grade).toMatchObject({ id: saved.grade.id,earnedUnits: 8000,learnerFeedback: 'Private learner feedback',published: false });
    expect(JSON.stringify(detail)).not.toContain('Secret instructor note');
  });

  it('allows explicit active administrators to read and manually grade another owner class while instructor mode stays owner-only', async () => {
    const f = await fixture(), saved = await grade(f), adminId = await person(), admin = releaseRepository(adminId,'administrator');
    await expect(admin.readAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await db.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [adminId]);
    expect((await admin.readAssignment(f.classroom.id,f.assignmentId)).roster).toHaveLength(2);
    const grades = gradeRepository(adminId,'administrator');
    expect((await grades.readClassGradebook(f.classroom.id)).classroom.id).toBe(f.classroom.id);
    expect((await grades.readRecipient(saved.recipient.id)).grades[0].privateNote).toBe('Secret instructor note');
    const corrected = await grades.appendGrade({ ...saved.input,expectedClassId: f.classroom.id,expectedGradeRevisionId: saved.grade.id,criterionScores: { approach: 4000,correctness: 4000,communication: 2000 },requestKey: randomUUID() });
    expect(corrected.earnedUnits).toBe(10_000);
    await expect(grades.appendGrade({ ...saved.input,expectedClassId: randomUUID(),expectedGradeRevisionId: corrected.id,requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(gradeRepository(adminId,'instructor').readRecipient(saved.recipient.id)).rejects.toBeInstanceOf(GradebookAccessError);
    await db.query('UPDATE administration_role_assignments SET revoked_at=clock_timestamp() WHERE user_id=$1', [adminId]);
    await expect(grades.readRecipient(saved.recipient.id)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(admin.readAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('rejects wrong roles, owners, class IDs and mixed-assignment targets', async () => {
    const f = await fixture(), other = await fixture(), saved = await grade(f);
    await expect(other.repo.readAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(releaseRepository(f.first,'learner').readAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.repo.readAssignment(other.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.repo.readResponseDetail(other.classroom.id,saved.recipient.id)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.repo.publishAssignmentGrades({ ...await releaseInput(f),assignmentId: other.assignmentId })).rejects.toBeInstanceOf(GradebookAccessError);
    await db.query("UPDATE users SET role='learner' WHERE id=$1", [f.owner]);
    await expect(f.repo.readAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.teacher.readClassGradebook(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('atomically releases all reviewed targets, recovers the original receipt and preserves private class visibility', async () => {
    const f = await fixture(); await grade(f); await grade(f,f.second);
    const input = await releaseInput(f), both = await Promise.all([f.repo.publishAssignmentGrades(input),f.repo.publishAssignmentGrades(input)]);
    expect(both[0]).toEqual(both[1]); expect(both[0].publications).toHaveLength(2);
    expect((await db.query('SELECT id FROM gradebook_publications')).rowCount).toBe(2);
    expect((await gradeRepository(f.first,'learner').readLearnerClassGrades(f.classroom.id)).assignments[0].publishedGrade?.earnedUnits).toBe(8000);
    const viewer = releaseRepository(f.second,'learner');
    expect((await viewer.listSharedAssignments(f.classroom.id)).assignments).toEqual([]);
    await expect(viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(f.repo.publishAssignmentGrades({ ...input,reason: 'Changed same-key action' })).rejects.toBeInstanceOf(GradebookConflictError);
    await expect(f.repo.publishAssignmentGrades({ ...input,requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
  });

  it('rejects one stale grade without releasing any other target or storing a partial receipt', async () => {
    const f = await fixture(), first = await grade(f); await grade(f,f.second); const input = await releaseInput(f);
    await f.teacher.appendGrade({ ...first.input,expectedGradeRevisionId: first.grade.id,criterionScores: { approach: 4000,correctness: 4000,communication: 2000 },requestKey: randomUUID() });
    await expect(f.repo.publishAssignmentGrades(input)).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await db.query('SELECT id FROM gradebook_publications')).rowCount).toBe(0);
    expect((await db.query('SELECT id FROM gradebook_release_batches')).rowCount).toBe(0);
  });

  it('recovers an accepted batch after corrections and later publication without releasing the new grade', async () => {
    const f = await fixture(), saved = await grade(f), input = await releaseInput(f), first = await f.repo.publishAssignmentGrades(input);
    const corrected = await f.teacher.appendGrade({ ...saved.input,expectedGradeRevisionId: saved.grade.id,criterionScores: { approach: 4000,correctness: 4000,communication: 2000 },requestKey: randomUUID() });
    expect(await f.repo.publishAssignmentGrades(input)).toEqual(first);
    expect((await f.repo.readAssignment(f.classroom.id,f.assignmentId)).roster.find(row => row.learner.id === f.first)?.releaseTarget).toMatchObject({ gradeRevisionId: corrected.id,expectedPublicationSequence: 1 });
    await f.repo.publishAssignmentGrades(await releaseInput(f));
    expect(await f.repo.publishAssignmentGrades(input)).toEqual(first);
    expect((await f.teacher.readRecipient(saved.recipient.id)).publications).toHaveLength(2);
  });

  it('serializes competing single and bulk releases without duplicates', async () => {
    const f = await fixture(), saved = await grade(f), input = await releaseInput(f);
    const outcomes = await Promise.allSettled([f.repo.publishAssignmentGrades(input),f.teacher.publishGrade({ recipientId: saved.recipient.id,gradeRevisionId: saved.grade.id,expectedPublicationSequence: 0,reason: 'Competing individual release',requestKey: randomUUID() })]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await db.query('SELECT id FROM gradebook_publications')).rowCount).toBe(1);
  });

  it('blocks withdrawn, excused, archived and latest-response-changed targets', async () => {
    const f = await fixture(), saved = await grade(f), input = await releaseInput(f);
    await gradeRepository(f.first,'learner').submitAttempt({ recipientId: saved.recipient.id,policyVersionId: saved.recipient.policy_id,response: { text: 'A newer response',language: 'python' },requestKey: randomUUID() });
    await expect(f.repo.publishAssignmentGrades(input)).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await f.repo.readAssignment(f.classroom.id,f.assignmentId)).roster.find(row => row.learner.id === f.first)).toMatchObject({ ready: false,state: 'needs_review',earnedUnits: null });
    const other = await fixture(), second = await grade(other), next = await releaseInput(other);
    await db.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2', [other.classroom.id,other.first]);
    await expect(other.repo.publishAssignmentGrades(next)).rejects.toBeInstanceOf(GradebookConflictError);
    await other.classes.joinClassByCode({ userId: other.first,code: other.classroom.joinCode });
    const applicability = (await other.teacher.readRecipient(second.recipient.id)).applicability;
    await other.teacher.setRecipientApplicability({ recipientId: second.recipient.id,applicability: 'excused',expectedApplicabilityRevisionId: applicability.id,reason: 'Excuse reviewed synthetic response',requestKey: randomUUID() });
    await expect(other.repo.publishAssignmentGrades(next)).rejects.toBeInstanceOf(GradebookConflictError);
    await db.query('UPDATE classrooms SET archived_at=clock_timestamp() WHERE id=$1', [other.classroom.id]);
    await expect(other.repo.publishAssignmentGrades(next)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('rejects duplicate, empty and oversized command lists without truncation', async () => {
    const f = await fixture(); await grade(f); const input = await releaseInput(f), target = input.targets[0];
    for (const selected of [[],[target,target],Array.from({ length: 501 },() => target)]) await expect(f.repo.publishAssignmentGrades({ ...input,targets: selected })).rejects.toBeInstanceOf(GradeReleaseValidationError);
    await expect(f.repo.publishAssignmentGrades({ ...input,targets: [{ ...target,expectedPublicationSequence: -1 }] })).rejects.toBeInstanceOf(GradeReleaseValidationError);
    await expect(f.repo.publishAssignmentGrades({ ...input,requestKey: ' ' })).rejects.toBeInstanceOf(GradeReleaseValidationError);
    expect((await db.query('SELECT id FROM gradebook_publications')).rowCount).toBe(0);
  });

  it('rolls every release back when an audit event fails', async () => {
    const f = await fixture(); await grade(f); await grade(f,f.second); const input = await releaseInput(f);
    await db.query(`CREATE FUNCTION synthetic_reject_release_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='gradebook.assignment.release' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER synthetic_release_audit BEFORE INSERT ON administration_audit_events FOR EACH ROW EXECUTE FUNCTION synthetic_reject_release_audit()`);
    try { await expect(f.repo.publishAssignmentGrades(input)).rejects.toThrow('Synthetic audit failure'); }
    finally { await db.query('DROP TRIGGER synthetic_release_audit ON administration_audit_events; DROP FUNCTION synthetic_reject_release_audit()'); }
    expect((await db.query('SELECT id FROM gradebook_publications')).rowCount).toBe(0);
    expect((await db.query('SELECT id FROM gradebook_release_batches')).rowCount).toBe(0);
    expect((await f.repo.publishAssignmentGrades(input)).publications).toHaveLength(2);
  });

  it('shares only an explicitly reviewed released snapshot and lets classmates discover and read its pinned answers', async () => {
    const f = await releasedFixture(), input = await shareInput(f), shared = await f.repo.publishClassResults(input), viewer = releaseRepository(f.second,'learner');
    expect(shared).toMatchObject({ sequence: 1,shared: true,recipientCount: 1 });
    expect(await f.repo.publishClassResults(input)).toEqual(shared);
    expect((await viewer.listSharedAssignments(f.classroom.id)).assignments).toEqual([expect.objectContaining({ id: f.assignmentId,recipientCount: 1 })]);
    const results = await viewer.readSharedAssignment(f.classroom.id,f.assignmentId);
    expect(results.learners).toHaveLength(1); expect(results.learners[0].response?.text).toBeNull();
    const detail = await viewer.readSharedResponseDetail(f.classroom.id,f.assignmentId,f.saved.recipient.id);
    expect(detail.response?.text).toBe(`Saved response for ${f.first}`); expect(detail.earnedUnits).toBe(8000);
    expect(JSON.stringify(results)).not.toMatch(/@example.invalid|learnerFeedback|criterionScores|privateNote|solution_code|test_cases/);
    expect(JSON.stringify(detail)).not.toMatch(/@example.invalid|Private learner feedback|Secret instructor note|learnerFeedback|criterionScores|privateNote/);
  });

  it('does not share unreleased scores or allow a private release to imply class sharing', async () => {
    const f = await fixture(), saved = await grade(f), target = { recipientId: saved.recipient.id,gradeRevisionId: saved.grade.id,publicationId: randomUUID(),attemptId: saved.attempt.id };
    await expect(f.repo.publishClassResults({ classId: f.classroom.id,assignmentId: f.assignmentId,targets: [target],expectedSharingSequence: 0,requestKey: randomUUID(),reason: 'Attempt premature shared result' })).rejects.toBeInstanceOf(GradebookConflictError);
    expect((await f.repo.readAssignment(f.classroom.id,f.assignmentId)).sharing).toBeNull();
  });

  it('revokes class access independently while individual released grades stay visible', async () => {
    const f = await releasedFixture(), shared = await f.repo.publishClassResults(await shareInput(f));
    const revoke = { classId: f.classroom.id,assignmentId: f.assignmentId,expectedSharingSequence: shared.sequence,requestKey: randomUUID(),reason: 'End named class result access' };
    const receipt = await f.repo.revokeClassResults(revoke);
    expect(receipt).toMatchObject({ sequence: 2,shared: false,recipientCount: 0 }); expect(await f.repo.revokeClassResults(revoke)).toEqual(receipt);
    const viewer = releaseRepository(f.second,'learner');
    await expect(viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(viewer.readSharedResponseDetail(f.classroom.id,f.assignmentId,f.saved.recipient.id)).rejects.toBeInstanceOf(GradebookAccessError);
    expect((await viewer.listSharedAssignments(f.classroom.id)).assignments).toEqual([]);
    expect((await gradeRepository(f.first,'learner').readLearnerClassGrades(f.classroom.id)).assignments[0].publishedGrade?.earnedUnits).toBe(8000);
  });

  it('requires current sharing sequence and returns the original publish receipt after revocation', async () => {
    const f = await releasedFixture(), input = await shareInput(f), original = await f.repo.publishClassResults(input);
    await expect(f.repo.publishClassResults({ ...input,requestKey: randomUUID() })).rejects.toBeInstanceOf(GradebookConflictError);
    await f.repo.revokeClassResults({ classId: f.classroom.id,assignmentId: f.assignmentId,expectedSharingSequence: 1,requestKey: randomUUID(),reason: 'Revoke reviewed class publication' });
    expect(await f.repo.publishClassResults(input)).toEqual(original);
    expect((await f.repo.readAssignment(f.classroom.id,f.assignmentId)).sharing?.shared).toBe(false);
    await expect(f.repo.publishClassResults({ ...input,reason: 'Same key with changed sharing' })).rejects.toBeInstanceOf(GradebookConflictError);
  });

  it('suppresses corrected or newly submitted work instead of silently broadening an old sharing publication', async () => {
    const f = await releasedFixture(); await f.repo.publishClassResults(await shareInput(f)); const viewer = releaseRepository(f.second,'learner');
    const correction = await f.teacher.appendGrade({ ...f.saved.input,expectedGradeRevisionId: f.saved.grade.id,criterionScores: { approach: 4000,correctness: 4000,communication: 2000 },requestKey: randomUUID() });
    expect((await viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
    await expect(viewer.readSharedResponseDetail(f.classroom.id,f.assignmentId,f.saved.recipient.id)).rejects.toBeInstanceOf(GradebookAccessError);
    await f.repo.publishAssignmentGrades(await releaseInput(f));
    expect((await viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
    await f.repo.publishClassResults(await shareInput(f));
    expect((await viewer.readSharedResponseDetail(f.classroom.id,f.assignmentId,f.saved.recipient.id)).earnedUnits).toBe(correction.earnedUnits);
    await gradeRepository(f.first,'learner').submitAttempt({ recipientId: f.saved.recipient.id,policyVersionId: f.saved.recipient.policy_id,response: { text: 'New private response',language: 'python' },requestKey: randomUUID() });
    expect((await viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
  });

  it('rechecks class membership for viewers and subjects, and denies archived or wrong-class shared reads', async () => {
    const f = await releasedFixture(); await f.repo.publishClassResults(await shareInput(f)); const viewer = releaseRepository(f.second,'learner'), outsider = await person();
    await expect(releaseRepository(outsider,'learner').readSharedAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await expect(viewer.readSharedAssignment(randomUUID(),f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
    await db.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2', [f.classroom.id,f.first]);
    expect((await viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
    await f.classes.joinClassByCode({ userId: f.first,code: f.classroom.joinCode });
    await db.query('DELETE FROM class_enrollments WHERE class_id=$1 AND user_id=$2', [f.classroom.id,f.second]);
    await expect(viewer.listSharedAssignments(f.classroom.id)).rejects.toBeInstanceOf(GradebookAccessError);
    await f.classes.joinClassByCode({ userId: f.second,code: f.classroom.joinCode });
    await db.query('UPDATE classrooms SET archived_at=clock_timestamp() WHERE id=$1', [f.classroom.id]);
    await expect(viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('suppresses excused subjects and open disputes in already shared results', async () => {
    const f = await releasedFixture(); await f.repo.publishClassResults(await shareInput(f)); const viewer = releaseRepository(f.second,'learner');
    const history = await f.teacher.readRecipient(f.saved.recipient.id);
    await gradeRepository(f.first,'learner').openGradeDispute({ recipientId: f.saved.recipient.id,expectedDisputeEventId: null,gradeRevisionId: f.saved.grade.id,
      reason: 'Please review this released score',requestKey: randomUUID() });
    expect((await viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
    expect((await f.repo.readAssignment(f.classroom.id,f.assignmentId)).roster.find(row => row.learner.id === f.first)?.shareTarget).toBeNull();
    await f.teacher.setRecipientApplicability({ recipientId: f.saved.recipient.id,applicability: 'excused',expectedApplicabilityRevisionId: history.applicability.id,reason: 'Excuse after publication',requestKey: randomUUID() });
    expect((await viewer.readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
  });

  it('checks administrative authority before replaying accepted receipts', async () => {
    const f = await fixture(); await grade(f); const adminId = await person(); await db.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [adminId]);
    const admin = releaseRepository(adminId,'administrator'), input = await releaseInput(f), receipt = await admin.publishAssignmentGrades(input);
    expect(receipt.actorId).toBe(adminId);
    await db.query('UPDATE administration_role_assignments SET revoked_at=clock_timestamp() WHERE user_id=$1', [adminId]);
    await expect(admin.publishAssignmentGrades(input)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('keeps database tables and invoker helpers private, immutable and scope-checked', async () => {
    const f = await releasedFixture(), share = await f.repo.publishClassResults(await shareInput(f));
    const tables = ['gradebook_release_batches','gradebook_release_batch_items','gradebook_class_result_events','gradebook_class_result_targets','gradebook_class_result_commands'];
    const privacy = await db.query(`SELECT relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated FROM pg_class c WHERE relname=ANY($1::text[])`, [tables]);
    expect(privacy.rows).toHaveLength(5); for (const row of privacy.rows) expect(row).toEqual({ relrowsecurity: true,anon: false,authenticated: false });
    const helpers = await db.query(`SELECT prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') AS exposed
      FROM pg_proc p WHERE proname=ANY($1::text[])`, [['gradebook_release_scope_guard','gradebook_release_item_guard','gradebook_class_result_target_guard']]);
    expect(helpers.rows).toHaveLength(3); for (const row of helpers.rows) expect(row).toEqual({ prosecdef: false,exposed: false });
    await expect(db.query('UPDATE gradebook_class_result_events SET shared=false WHERE id=$1', [share.id])).rejects.toMatchObject({ code: '23514' });
    const other = await fixture();
    await expect(db.query('INSERT INTO gradebook_class_result_events(class_id,assignment_id,sequence,shared,recipient_count) VALUES($1,$2,1,true,1)', [other.classroom.id,f.assignmentId])).rejects.toMatchObject({ code: '23514' });
    await expect(runner({ databaseUrl: `postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`,dir: 'migrations',migrationsTable: 'pgmigrations',direction: 'down',count: 1,singleTransaction: true,log: () => {} })).rejects.toThrow('forward-only');
  });

  it('does not copy names or answers into sharing receipts and cascades deleted learner references', async () => {
    const f = await releasedFixture(); await f.repo.publishClassResults(await shareInput(f));
    const columns = await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns
      WHERE table_name=ANY($1::text[]) AND data_type IN('json','jsonb')`, [['gradebook_release_batches','gradebook_release_batch_items','gradebook_class_result_events','gradebook_class_result_targets','gradebook_class_result_commands']]);
    expect(columns.rows).toEqual([]);
    await db.query('DELETE FROM users WHERE id=$1', [f.first]);
    expect((await db.query('SELECT recipient_id FROM gradebook_class_result_targets')).rowCount).toBe(0);
    expect((await releaseRepository(f.second,'learner').readSharedAssignment(f.classroom.id,f.assignmentId)).learners).toEqual([]);
  });

  it('denies replay after hard-deleted targets rather than returning a partial release receipt', async () => {
    const f = await fixture(); await grade(f); await grade(f,f.second);
    const input = await releaseInput(f); expect((await f.repo.publishAssignmentGrades(input)).publications).toHaveLength(2);
    await db.query('DELETE FROM users WHERE id=$1', [f.first]);
    await expect(f.repo.publishAssignmentGrades(input)).rejects.toBeInstanceOf(GradebookAccessError);
  });

  it('reads frozen quiz questions and choices without answer keys, and permits selected-audience classmates to see explicitly shared work', async () => {
    const f = await fixture(), snapshot = freezeQuizQuestionSelection([{ maxUnits: 250,question: freezeQuestionVersion({ questionId: 'shared-invariant',version: 1,versionId: 'shared-invariant@1',kind: 'multiple_choice',status: 'reviewed',
      title: 'A pinned quiz question',prompt: 'Which step comes first?',difficulty: 'foundation',activityIds: ['pair-with-target-v1'],conceptIds: ['hash-maps'],
      options: [{ id: 'lookup',text: 'Look up the complement.',misconceptionTags: [] },{ id: 'insert',text: 'Insert first.',misconceptionTags: ['self-match'] }],correctOptionId: 'lookup',explanation: 'Hidden explanation',
      provenance: { kind: 'original',authorId: 'synthetic-author',authoredAt: '2026-10-26T10:00:00.000Z' },review: { reviewerId: 'synthetic-reviewer',reviewedAt: '2026-10-26T11:00:00.000Z',notes: 'Synthetic independent review.' } }) }]);
    const drafts = new PostgresAssessmentDraftRepository(db,principal(f.owner)), author = new PostgresQuizAssignmentRepository(db,principal(f.owner));
    const draft = await drafts.createDraft({ draft: { classId: f.classroom.id,title: 'Reviewed selected quiz',instructions: 'Choose one.',questions: [{ questionVersionId: 'shared-invariant@1',maxUnits: 250 }],availableAt: null,dueAt: null,closesAt: null },requestKey: randomUUID(),reason: 'Save synthetic quiz' });
    const context = await author.readAuthorDraft(draft.id), publication = await author.publishDraft({ draftId: draft.id,expectedRevision: 1,expectedRosterFingerprint: context.rosterFingerprint,audience: { kind: 'selected',learnerIds: [f.first] },snapshot,requestKey: randomUUID(),reason: 'Assign selected synthetic quiz' });
    const recipientId = (await db.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1', [publication.policyVersionId])).rows[0].id;
    const learner = new PostgresQuizAssignmentRepository(db,principal(f.first,'learner'));
    await learner.saveAnswers({ recipientId,expectedRevision: 0,answers: { 'shared-invariant@1': 'lookup' },requestKey: randomUUID() });
    await learner.submitQuiz({ recipientId,expectedRevision: 1,requestKey: randomUUID() });
    const preview = await f.repo.readAssignment(f.classroom.id,publication.assignmentId);
    expect(preview.content.questions[0]).toMatchObject({ id: 'shared-invariant@1',title: 'A pinned quiz question',prompt: 'Which step comes first?' });
    expect(preview.roster.find(row => row.learner.id === f.second)).toMatchObject({ state: 'not_assigned',releaseTarget: null });
    expect(JSON.stringify(preview)).not.toMatch(/correctOptionId|explanation|misconceptionTags|provenance|reviewerId/);
    await f.repo.publishAssignmentGrades({ classId: f.classroom.id,assignmentId: publication.assignmentId,targets: preview.roster.flatMap(row => row.releaseTarget ? [row.releaseTarget] : []),requestKey: randomUUID(),reason: 'Release reviewed quiz' });
    const released = await f.repo.readAssignment(f.classroom.id,publication.assignmentId);
    await f.repo.publishClassResults({ classId: f.classroom.id,assignmentId: publication.assignmentId,targets: released.roster.flatMap(row => row.shareTarget ? [row.shareTarget] : []),expectedSharingSequence: 0,requestKey: randomUUID(),reason: 'Explicitly share selected quiz responses with the class' });
    const detail = await releaseRepository(f.second,'learner').readSharedResponseDetail(f.classroom.id,publication.assignmentId,recipientId);
    expect(detail.response?.answers).toEqual({ 'shared-invariant@1': 'lookup' });
    expect(JSON.stringify(detail)).not.toMatch(/correctOptionId|explanation|misconceptionTags|provenance|reviewerId|learnerFeedback/);
  });

  it('projects frozen written prompts and saved final responses for administrator review and class sharing', async () => {
    const f = await fixture(), author = new PostgresWrittenAssessmentRepository(db,principal(f.owner));
    const draft = await author.saveDraft({ draftId: null,expectedRevision: null,draft: { classId: f.classroom.id,title: 'Written invariant',instructions: 'Use clear steps.',prompt: 'Explain the invariant in frozen pseudocode.',criteria: [{ id: 'reasoning',label: 'Reasoning',maxUnits: 1000 }],availableAt: null,dueAt: null,closesAt: null },requestKey: randomUUID(),reason: 'Save authored prompt' });
    const context = await author.readAuthorDraft(draft.id), published = await author.publishDraft({ draftId: draft.id,expectedRevision: 1,expectedRosterFingerprint: context.rosterFingerprint,audience: { kind: 'selected',learnerIds: [f.first] },requestKey: randomUUID(),reason: 'Publish written prompt' });
    const recipientId = (await db.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1', [published.policyVersionId])).rows[0].id;
    const learner = new PostgresWrittenAssessmentRepository(db,principal(f.first,'learner'));
    await learner.saveResponse({ recipientId,expectedRevision: 0,text: 'LOOKUP before INSERT; preserve earlier indices.',requestKey: randomUUID() });
    const attempt = await learner.submitResponse({ recipientId,expectedRevision: 1,requestKey: randomUUID() });
    await f.teacher.appendGrade({ recipientId,attemptId: attempt.attemptId,expectedGradeRevisionId: null,kind: 'scored',criterionScores: { reasoning: 900 },reason: 'Grade frozen written response',requestKey: randomUUID() });
    const preview = await f.repo.readAssignment(f.classroom.id,published.assignmentId);
    expect(preview.assignment.kind).toBe('written'); expect(preview.content.prompt).toBe('Explain the invariant in frozen pseudocode.');
    const detail = await f.repo.readResponseDetail(f.classroom.id,recipientId);
    expect(detail.response?.text).toBe('LOOKUP before INSERT; preserve earlier indices.');
    expect(detail.content).toEqual(preview.content);
  });
});

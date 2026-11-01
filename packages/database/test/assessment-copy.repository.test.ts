import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { freezeQuestionVersion, freezeQuizQuestionSelection } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresQuizAssignmentRepository } from '../src/repositories/quiz-assignment.repository.js';
import { PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import {
  AssessmentDraftAccessError, AssessmentDraftConflictError, AssessmentDraftValidationError,
  PostgresAssessmentDraftRepository, type AssessmentDraftCopyInput, type AssessmentDraftInput,
} from '../src/repositories/assessment-draft.repository.js';
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

const versions = ['copy-invariant@1', 'copy-boundary@1'];
const draft = (classId: string): AssessmentDraftInput => ({
  classId, title: 'Synthetic saved reasoning quiz', instructions: 'Choose the strongest invariant.',
  questions: [{ questionVersionId: versions[0], maxUnits: 125 }, { questionVersionId: versions[1], maxUnits: 275 }],
  availableAt: '2026-10-26T09:00:00Z', dueAt: '2026-10-27T13:00:00Z', closesAt: '2026-10-28T13:00:00Z',
});
const mutation = (body: AssessmentDraftInput, requestKey = randomUUID()) => ({ draft: body, requestKey, reason: 'Prepare synthetic saved source' });
async function person(role: 'learner' | 'instructor' | 'admin' = 'instructor') {
  return (await database.query<{ id: string }>('INSERT INTO users(display_name,role) VALUES($1,$2) RETURNING id', ['Synthetic copy author', role])).rows[0].id;
}
async function classroom(userId: string, name = 'Synthetic copy class') {
  return new PostgresClassroomRepository(database, userId).createClass({ name, description: '', actorId: userId, reason: 'Synthetic copy destination' });
}
async function fixture() {
  const userId = await person(), sourceClass = await classroom(userId, 'Source class'), destinationClass = await classroom(userId, 'Destination class');
  const repository = new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId });
  const source = await repository.createDraft(mutation(draft(sourceClass.id)));
  const input: AssessmentDraftCopyInput = { sourceDraftId: source.id, sourceClassId: sourceClass.id,
    destinationClassId: destinationClass.id, expectedRevision: 1, requestKey: randomUUID(), reason: 'Author explicitly copied saved quiz' };
  return { userId, sourceClass, destinationClass, repository, source, input };
}

describe('explicit copies of saved quiz drafts', () => {
  it('copies exact ordered versions and points into a new private draft, clearing dates and preserving the source', async () => {
    const f = await fixture();
    const copied = await f.repository.copyDraft({ ...f.input, requestId: 'synthetic-copy-request' }, versions);
    expect(copied).toMatchObject({ classId: f.destinationClass.id, title: `Copy of ${f.source.title}`, instructions: f.source.instructions,
      revision: 1, status: 'draft', maxUnits: 400, createdBy: f.userId, questions: f.source.questions,
      availableAt: null, dueAt: null, closesAt: null });
    expect(copied.id).not.toBe(f.source.id);
    expect(await f.repository.getDraft(f.source.id)).toEqual(f.source);
    const fresh = createDatabaseClient(config);
    try { expect(await new PostgresAssessmentDraftRepository(fresh, { role: 'instructor', userId: f.userId }).getDraft(copied.id)).toEqual(copied); }
    finally { await fresh.close(); }
    for (const table of ['class_assignments', 'gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'quiz_publications']) {
      expect((await database.query(`SELECT id FROM ${table}`)).rows).toEqual([]);
    }
    const audit = await database.query<{ metadata: unknown; request_id: string }>("SELECT metadata,request_id FROM administration_audit_events WHERE action='assessments.draft.copy'");
    expect(audit.rows).toEqual([{ request_id: 'synthetic-copy-request', metadata: { classId: f.destinationClass.id, revision: 1,
      questionCount: 2, maxUnits: 400, sourceDraftId: f.source.id, sourceClassId: f.sourceClass.id, sourceRevision: 1 } }]);
    expect(JSON.stringify(audit.rows)).not.toContain(f.source.instructions);
    expect(JSON.stringify(copied)).not.toMatch(/correctOptionId|answerKey|learnerId|snapshot_hash|misconceptionTags/);
  });

  it('supports the same destination class and a bounded copy title', async () => {
    const f = await fixture();
    const source = await f.repository.updateDraft({ ...mutation({ ...draft(f.sourceClass.id), title: 'x'.repeat(160) }), draftId: f.source.id, expectedRevision: 1 });
    const copied = await f.repository.copyDraft({ ...f.input, destinationClassId: f.sourceClass.id, expectedRevision: 2 }, versions);
    expect(copied.title).toHaveLength(160); expect(copied.title).toBe(`Copy of ${source.title}`.slice(0, 160));
    expect(copied.classId).toBe(source.classId); expect(copied.questions).toEqual(source.questions);
  });

  it('serializes simultaneous retries into one draft, immutable receipt and audit event', async () => {
    const f = await fixture();
    const copies = await Promise.all(Array.from({ length: 4 }, (_, index) => f.repository.copyDraft(index % 2 ? {
      ...f.input, sourceDraftId: f.input.sourceDraftId.toUpperCase(), sourceClassId: f.input.sourceClassId.toUpperCase(),
      destinationClassId: f.input.destinationClassId.toUpperCase(),
    } : f.input, versions)));
    for (const copy of copies) expect(copy).toEqual(copies[0]);
    expect(await f.repository.listDrafts(f.destinationClass.id)).toHaveLength(1);
    expect((await database.query('SELECT draft_id FROM assessment_draft_mutations WHERE request_key=$1', [f.input.requestKey])).rows).toHaveLength(1);
    expect((await database.query("SELECT id FROM administration_audit_events WHERE action='assessments.draft.copy'")).rows).toHaveLength(1);
  });

  it('recovers the original receipt after source and copy edits or question retirement', async () => {
    const f = await fixture();
    const copied = await f.repository.copyDraft(f.input, versions);
    await f.repository.updateDraft({ ...mutation({ ...draft(f.sourceClass.id), title: 'New saved source', questions: [...f.source.questions].reverse() }), draftId: f.source.id, expectedRevision: 1 });
    const currentCopy = await f.repository.updateDraft({ ...mutation({ ...draft(f.destinationClass.id), title: 'Edited copied draft' }), draftId: copied.id, expectedRevision: 1 });
    expect(await f.repository.copyDraft(f.input, [])).toEqual(copied);
    expect(await f.repository.getDraft(copied.id)).toEqual(currentCopy);
    expect(await f.repository.listDrafts(f.destinationClass.id)).toHaveLength(1);
  });

  it('rejects changed copy inputs and cross-operation request-key reuse', async () => {
    const f = await fixture();
    const copied = await f.repository.copyDraft(f.input, versions);
    for (const changed of [{ destinationClassId: f.sourceClass.id }, { expectedRevision: 2 }, { reason: 'Different copy command reason' }]) {
      await expect(f.repository.copyDraft({ ...f.input, ...changed }, versions)).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    }
    await expect(f.repository.createDraft(mutation(draft(f.destinationClass.id), f.input.requestKey))).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    await expect(f.repository.updateDraft({ ...mutation(draft(f.destinationClass.id), f.input.requestKey), draftId: copied.id, expectedRevision: 1 })).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    const creation = mutation(draft(f.destinationClass.id));
    await f.repository.createDraft(creation);
    await expect(f.repository.copyDraft({ ...f.input, requestKey: creation.requestKey }, versions)).rejects.toBeInstanceOf(AssessmentDraftConflictError);
  });

  it('requires the exact source class and current saved revision before any copy is written', async () => {
    const f = await fixture();
    await expect(f.repository.copyDraft({ ...f.input, sourceClassId: f.destinationClass.id }, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await f.repository.updateDraft({ ...mutation({ ...draft(f.sourceClass.id), title: 'Changed source before confirmation' }), draftId: f.source.id, expectedRevision: 1 });
    await expect(f.repository.copyDraft(f.input, versions)).rejects.toMatchObject({ name: 'AssessmentDraftConflictError', currentRevision: 2 });
    expect(await f.repository.listDrafts(f.destinationClass.id)).toEqual([]);
  });

  it('rejects unavailable versions rather than silently dropping or upgrading questions', async () => {
    const f = await fixture();
    for (const available of [[], [versions[0]], ['copy-invariant@2', versions[1]]]) {
      await expect(f.repository.copyDraft(f.input, available)).rejects.toThrow('Edit the saved source draft');
    }
    expect(await f.repository.listDrafts(f.destinationClass.id)).toEqual([]);
    expect((await database.query('SELECT draft_id FROM assessment_draft_mutations WHERE request_key=$1', [f.input.requestKey])).rows).toEqual([]);
  });

  it('authorizes source and destination separately and rejects forged instructor principals', async () => {
    const f = await fixture(), otherId = await person(), otherClass = await classroom(otherId);
    const other = new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId: otherId });
    const otherSource = await other.createDraft(mutation(draft(otherClass.id)));
    await expect(f.repository.copyDraft({ ...f.input, destinationClassId: otherClass.id }, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(f.repository.copyDraft({ ...f.input, sourceClassId: otherClass.id, sourceDraftId: otherSource.id }, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    const learnerId = await person('learner');
    await expect(new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId: learnerId }).copyDraft(f.input, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    expect(await f.repository.listDrafts(f.destinationClass.id)).toEqual([]);
  });

  it('projects only active owned destination identities and names', async () => {
    const f = await fixture(), otherId = await person();
    await classroom(otherId, 'Other owner');
    const archived = await classroom(f.userId, 'Archived destination');
    await database.query('UPDATE classrooms SET archived_at=now() WHERE id=$1', [archived.id]);
    expect(await f.repository.listCopyDestinations()).toEqual([{ id: f.destinationClass.id, name: 'Destination class' }, { id: f.sourceClass.id, name: 'Source class' }]);
    const learnerId = await person('learner');
    await expect(new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId: learnerId }).listCopyDestinations()).rejects.toBeInstanceOf(AssessmentDraftAccessError);
  });

  it('requires an active class-management administration grant for cross-class copies, including retries', async () => {
    const f = await fixture(), otherId = await person(), destination = await classroom(otherId, 'Other destination');
    const adminId = await person('admin'), admin = new PostgresAssessmentDraftRepository(database, { role: 'administrator', userId: adminId });
    const input = { ...f.input, destinationClassId: destination.id };
    await expect(admin.copyDraft(input, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(admin.listCopyDestinations()).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'content_author')", [adminId]);
    await expect(admin.copyDraft(input, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [adminId]);
    const copied = await admin.copyDraft(input, versions);
    expect(copied.createdBy).toBe(adminId);
    expect((await admin.listCopyDestinations()).map(row => Object.keys(row))).toEqual([['id','name'], ['id','name'], ['id','name']]);
    await database.query("UPDATE administration_role_assignments SET revoked_at=now() WHERE user_id=$1 AND role='administrator'", [adminId]);
    await expect(admin.copyDraft(input, [])).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(admin.listCopyDestinations()).rejects.toBeInstanceOf(AssessmentDraftAccessError);
  });

  it('rechecks both class ownership and archival before replaying an accepted copy', async () => {
    const f = await fixture(), otherId = await person();
    await f.repository.copyDraft(f.input, versions);
    for (const classId of [f.sourceClass.id, f.destinationClass.id]) {
      await database.query('UPDATE classrooms SET archived_at=now() WHERE id=$1', [classId]);
      await expect(f.repository.copyDraft(f.input, [])).rejects.toBeInstanceOf(AssessmentDraftAccessError);
      await database.query('UPDATE classrooms SET archived_at=NULL,created_by=$2 WHERE id=$1', [classId, otherId]);
      await expect(f.repository.copyDraft(f.input, [])).rejects.toBeInstanceOf(AssessmentDraftAccessError);
      await database.query('UPDATE classrooms SET created_by=$2 WHERE id=$1', [classId, f.userId]);
    }
    await database.query("UPDATE users SET role='learner' WHERE id=$1", [f.userId]);
    await expect(f.repository.copyDraft(f.input, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
  });

  it('allows simultaneous opposite-direction copies without moving or overwriting either source', async () => {
    const f = await fixture();
    const other = await f.repository.createDraft(mutation({ ...draft(f.destinationClass.id), title: 'Opposite source quiz' }));
    const [forward, backward] = await Promise.all([f.repository.copyDraft(f.input, versions), f.repository.copyDraft({ ...f.input,
      sourceClassId: f.destinationClass.id, destinationClassId: f.sourceClass.id, sourceDraftId: other.id, requestKey: randomUUID() }, versions)]);
    expect(forward.classId).toBe(other.classId); expect(backward.classId).toBe(f.source.classId);
    expect(await f.repository.getDraft(f.source.id)).toEqual(f.source); expect(await f.repository.getDraft(other.id)).toEqual(other);
  });

  it('waits for a locked parent class without locking its dependent source during concurrent deletion', async () => {
    const f = await fixture(), deletion = await database.getPool().connect();
    let result: Promise<unknown> | undefined;
    try {
      await deletion.query('BEGIN'); await deletion.query("SET LOCAL lock_timeout='3s'");
      const pid = (await deletion.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await deletion.query('SELECT id FROM classrooms WHERE id=$1 FOR UPDATE', [f.sourceClass.id]);
      result = f.repository.copyDraft(f.input, versions).catch(error => error);
      await vi.waitFor(async () => {
        expect((await database.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [pid])).rows).toHaveLength(1);
      });
      await deletion.query('DELETE FROM classrooms WHERE id=$1', [f.sourceClass.id]); await deletion.query('COMMIT');
      expect(await result).toBeInstanceOf(AssessmentDraftAccessError);
    } finally { await deletion.query('ROLLBACK'); deletion.release(); await result; }
  });

  it('does not copy publications, audiences, submissions or scores from an assigned source, and uses its explicitly saved revision', async () => {
    const f = await fixture(), learnerId = await person('learner');
    await new PostgresClassroomRepository(database, f.userId).joinClassByCode({ userId: learnerId, code: f.sourceClass.joinCode });
    await f.repository.updateDraft({ ...mutation({ ...draft(f.sourceClass.id), availableAt: null, dueAt: null, closesAt: null }), draftId: f.source.id, expectedRevision: 1 });
    const author = new PostgresQuizAssignmentRepository(database, { role: 'instructor', userId: f.userId });
    const snapshot = freezeQuizQuestionSelection(f.source.questions.map(selection => ({ maxUnits: selection.maxUnits,
      question: freezeQuestionVersion({ questionId: selection.questionVersionId.split('@')[0], version: 1, versionId: selection.questionVersionId,
        kind: 'multiple_choice', status: 'reviewed', title: 'Synthetic copied question', prompt: 'Choose the preserved invariant.', difficulty: 'foundation',
        activityIds: ['pair-with-target-v1'], conceptIds: ['hash-maps'],
        options: [{ id: 'yes', text: 'Preserved.', misconceptionTags: [] }, { id: 'no', text: 'Broken.', misconceptionTags: ['synthetic-error'] }],
        correctOptionId: 'yes', explanation: 'A synthetic reviewed invariant.',
        provenance: { kind: 'original', authorId: 'synthetic-copy-author', authoredAt: '2026-10-26T10:00:00.000Z' },
        review: { reviewerId: 'synthetic-copy-reviewer', reviewedAt: '2026-10-26T11:00:00.000Z', notes: 'Synthetic independent content review.' } }) })));
    const authoring = await author.readAuthorDraft(f.source.id);
    const publication = await author.publishDraft({ draftId: f.source.id, expectedRevision: 2, expectedRosterFingerprint: authoring.rosterFingerprint,
      audience: { kind: 'class', learnerIds: [learnerId] }, snapshot, requestKey: randomUUID(), reason: 'Assign synthetic source quiz' });
    const learner = new PostgresQuizAssignmentRepository(database, { role: 'learner', userId: learnerId });
    const recipientId = (await database.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1', [publication.policyVersionId])).rows[0].id;
    await learner.saveAnswers({ recipientId, expectedRevision: 0, answers: Object.fromEntries(versions.map(version => [version, 'yes'])), requestKey: randomUUID() });
    await learner.submitQuiz({ recipientId, expectedRevision: 1, requestKey: randomUUID() });
    const scored = await author.readInstructorQuiz(recipientId);
    await new PostgresGradebookRepository(database, { role: 'instructor', userId: f.userId }).publishGrade({ recipientId,
      gradeRevisionId: scored.grade!.id, expectedPublicationSequence: 0, reason: 'Release synthetic source score', requestKey: randomUUID() });
    const edited = await f.repository.updateDraft({ ...mutation({ ...draft(f.sourceClass.id), title: 'Saved revision after assignment', questions: [...f.source.questions].reverse() }), draftId: f.source.id, expectedRevision: 2 });
    const tables = ['quiz_publications','class_assignments','gradebook_recipients','gradebook_attempts','gradebook_grade_revisions','gradebook_publications'];
    const before = await Promise.all(tables.map(async table => (await database.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
    const copied = await f.repository.copyDraft({ ...f.input, expectedRevision: 3 }, versions);
    expect(copied.questions).toEqual(edited.questions); expect(copied.title).toBe(`Copy of ${edited.title}`);
    const after = await Promise.all(tables.map(async table => (await database.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
    expect(after).toEqual(before); expect(before.every(rows => rows.length > 0)).toBe(true);
    expect(await learner.readLearnerQuiz(recipientId)).toMatchObject({ title: f.source.title, releasedGrade: { earnedUnits: 400 } });
    expect((await author.readAuthorDraft(copied.id)).publication).toBeNull();
  });

  it('rejects malformed copy parameters before writing a draft or receipt', async () => {
    const f = await fixture();
    for (const changed of [{ expectedRevision: 0 }, { expectedRevision: 0.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { requestKey: '' }, { requestKey: 'x'.repeat(129) }, { reason: 'short' }, { reason: 'x'.repeat(501) }, { requestId: 'x'.repeat(101) },
      { audience: ['not-permitted'] }]) {
      await expect(f.repository.copyDraft({ ...f.input, ...changed }, versions)).rejects.toBeInstanceOf(AssessmentDraftValidationError);
    }
    for (const field of ['sourceDraftId', 'sourceClassId', 'destinationClassId']) {
      await expect(f.repository.copyDraft({ ...f.input, [field]: 'invalid-id' }, versions)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    }
    expect(await f.repository.listDrafts(f.destinationClass.id)).toEqual([]);
  });

  it('rolls back the copied draft and receipt if its audit insert fails', async () => {
    const f = await fixture();
    await database.query(`CREATE FUNCTION copy_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='assessments.draft.copy' THEN RAISE EXCEPTION 'Synthetic copy audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER copy_test_audit_failure BEFORE INSERT ON administration_audit_events FOR EACH ROW EXECUTE FUNCTION copy_test_reject_audit()`);
    try {
      await expect(f.repository.copyDraft(f.input, versions)).rejects.toThrow('Synthetic copy audit failure');
      expect(await f.repository.listDrafts(f.destinationClass.id)).toEqual([]);
      expect((await database.query('SELECT draft_id FROM assessment_draft_mutations WHERE request_key=$1', [f.input.requestKey])).rows).toEqual([]);
      expect(await f.repository.getDraft(f.source.id)).toEqual(f.source);
    } finally { await database.query('DROP TRIGGER copy_test_audit_failure ON administration_audit_events; DROP FUNCTION copy_test_reject_audit()'); }
  });
});

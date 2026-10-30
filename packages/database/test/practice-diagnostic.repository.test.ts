import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { freezeQuestionVersion, scoreMultipleChoiceQuiz, type MultipleChoiceQuizSnapshot } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { DiagnosticAccessError, DiagnosticConflictError, DiagnosticValidationError, PostgresPracticeDiagnosticRepository } from '../src/repositories/practice-diagnostic.repository.js';
import { PostgresLearningEvidenceRepository } from '../src/repositories/learning-evidence.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer, database: DatabaseClient, config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine').withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' }).withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = createDatabaseClient(config);
  await prepareSupabaseTestDatabase(database); await runMigrations(config);
}, 60_000);
afterEach(async () => { if (database) await database.query('TRUNCATE users,classrooms,content_items CASCADE'); });
afterAll(async () => { await database?.close(); await container?.stop(); });

const activityIds = Array.from({ length: 10 }, (_, index) => `activity-${index}`);
const questions = activityIds.map((activityId, index) => freezeQuestionVersion({
  questionId: `personal-baseline-${index}`, version: 1, versionId: `personal-baseline-${index}@1`, kind: 'multiple_choice', status: 'reviewed',
  title: `Baseline ${index}`, prompt: 'Which choice preserves the invariant?', difficulty: 'foundation', activityIds: [activityId], conceptIds: [`concept-${index}`],
  options: [{ id: 'yes', text: 'The invariant holds.', misconceptionTags: [] }, { id: 'no', text: 'The invariant fails.', misconceptionTags: ['invariant-missing'] }],
  correctOptionId: 'yes', explanation: 'PRIVATE diagnostic explanation.', provenance: { kind: 'original', authorId: 'synthetic-author', authoredAt: '2026-10-29T10:00:00.000Z' },
  review: { reviewerId: 'synthetic-reviewer', reviewedAt: '2026-10-29T11:00:00.000Z', notes: 'PRIVATE diagnostic review.' },
}));
const blueprint = { questions, activityIds };
const person = async () => (await database.query<{ id: string }>("INSERT INTO users(display_name,role)VALUES('Synthetic diagnostic learner','learner') RETURNING id")).rows[0].id;
const repository = (userId: string, db = database, version?: string) => new PostgresPracticeDiagnosticRepository(db, userId, { ...blueprint, version });
const learning = (userId: string) => new PostgresLearningEvidenceRepository(database, { userId, practiceCatalog: [], practiceGradeVersion: 'synthetic-v1' });
async function consent(userId: string, optOut: boolean) {
  await database.query(`INSERT INTO learner_profiles(user_id,goal,experience,preferred_language,weekly_minutes,timezone,personalization_opt_out)
    VALUES($1,'interview','beginner','typescript',60,'UTC',$2) ON CONFLICT(user_id) DO UPDATE SET personalization_opt_out=EXCLUDED.personalization_opt_out`, [userId, optOut]);
}

describe('durable personal diagnostics', () => {
  it('starts once per blueprint under concurrent requests, resumes across clients and discloses only learner questions', async () => {
    const owner = await person(), repo = repository(owner), fresh = createDatabaseClient(config);
    try {
      expect(await repo.list()).toEqual({ current: null, history: [] });
      const [first, second] = await Promise.all([repo.start(), repository(owner, fresh).start()]);
      expect(first.id).toBe(second.id);
      expect(first.answerDraft).toMatchObject({ revision: 0, answers: Object.fromEntries(questions.map(item => [item.versionId, null])) });
      expect(first.feedback).toBeNull(); expect(first.submission).toBeNull();
      expect((await repository(owner, fresh).list()).current).toEqual(first);
      const serialized = JSON.stringify(first);
      for (const privateName of ['correctOptionId', 'misconceptionTags', 'explanation', 'provenance', 'reviewerId', 'PRIVATE']) expect(serialized).not.toContain(privateName);
      expect((await database.query('SELECT id FROM practice_diagnostics WHERE user_id=$1', [owner])).rows).toHaveLength(1);
      expect((await database.query('SELECT id FROM gradebook_recipients')).rows).toEqual([]);
    } finally { await fresh.close(); }
  });

  it('saves exact choices with CAS and recovers the original receipt after newer work on another client', async () => {
    const owner = await person(), repo = repository(owner), initial = await repo.start();
    const input = { expectedRevision: 0, answers: { [questions[0].versionId]: 'no' }, requestKey: randomUUID() };
    const first = await repo.save(initial.id, input);
    expect(first).toMatchObject({ diagnosticId: initial.id, requestKey: input.requestKey, currentRevision: 1, answerDraft: { revision: 1, answers: { [questions[0].versionId]: 'no' } } });
    const fresh = createDatabaseClient(config);
    try {
      const other = repository(owner, fresh);
      expect((await other.read(initial.id)).answerDraft).toEqual(first.answerDraft);
      const next = await other.save(initial.id, { expectedRevision: 1, answers: { [questions[0].versionId]: 'yes', [questions[1].versionId]: 'no' }, requestKey: randomUUID() });
      const replay = await other.save(initial.id, input);
      expect(replay.answerDraft).toEqual(first.answerDraft); expect(replay.currentRevision).toBe(2);
      expect((await repo.read(initial.id)).answerDraft).toEqual(next.answerDraft);
      await expect(repo.save(initial.id, { ...input, requestKey: randomUUID() })).rejects.toBeInstanceOf(DiagnosticConflictError);
      await expect(repo.save(initial.id, { ...input, answers: { [questions[0].versionId]: 'yes' } })).rejects.toMatchObject({ code: 'request_reused' });
    } finally { await fresh.close(); }
  });

  it('accepts one of two concurrent edits and preserves the winning answer set', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start();
    const results = await Promise.allSettled(['yes', 'no'].map(answer => repo.save(work.id, { expectedRevision: 0, answers: { [questions[0].versionId]: answer }, requestKey: randomUUID() })));
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(item => item.status === 'rejected')).toHaveLength(1);
    const saved = results.find(item => item.status === 'fulfilled');
    expect((await repo.read(work.id)).answerDraft).toEqual(saved?.status === 'fulfilled' ? saved.value.answerDraft : null);
  });

  it('rejects foreign owners, arbitrary answers, stale submissions and reused request keys before mutation', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start(), other = repository(await person());
    await expect(other.read(work.id)).rejects.toBeInstanceOf(DiagnosticAccessError);
    await expect(other.save(work.id, { expectedRevision: 0, answers: {}, requestKey: randomUUID() })).rejects.toBeInstanceOf(DiagnosticAccessError);
    await expect(other.submit(work.id, { expectedRevision: 0, requestKey: randomUUID() })).rejects.toBeInstanceOf(DiagnosticAccessError);
    for (const answers of [{ unknown: 'yes' }, { [questions[0].versionId]: 'forged-option' }, { [questions[0].versionId]: 100 }, []]) {
      await expect(repo.save(work.id, { expectedRevision: 0, answers, requestKey: randomUUID() })).rejects.toBeInstanceOf(DiagnosticValidationError);
    }
    await expect(repo.save(work.id, { expectedRevision: 0, answers: {}, requestKey: 'invalid' })).rejects.toBeInstanceOf(DiagnosticValidationError);
    await expect(repo.submit(work.id, { expectedRevision: 1, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'revision_changed' });
    expect((await repo.read(work.id)).answerDraft.revision).toBe(0);
    expect((await database.query('SELECT * FROM practice_diagnostic_requests')).rows).toEqual([]);
  });

  it('finalizes saved choices once, reveals dedicated feedback, and adds answered evidence without class grades or skipped weaknesses', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start();
    await repo.save(work.id, { expectedRevision: 0, answers: { [questions[0].versionId]: 'yes', [questions[1].versionId]: 'no' }, requestKey: randomUUID() });
    const input = { expectedRevision: 1, requestKey: randomUUID() }, receipt = await repo.submit(work.id, input);
    expect(await repository(owner).submit(work.id, input)).toEqual(receipt);
    const finished = await repo.read(work.id);
    expect(finished.submission).toEqual(receipt);
    expect(finished.feedback).toMatchObject({ correctCount: 1, answeredCount: 2, totalQuestions: 10 });
    expect(finished.feedback?.items[0]).toMatchObject({ correct: true, correctOptionId: 'yes', explanation: 'PRIVATE diagnostic explanation.' });
    expect(finished.feedback?.items[1]).toMatchObject({ correct: false, selectedOptionId: 'no' });
    expect(finished.feedback?.items[2]).toMatchObject({ selectedOptionId: null });
    await expect(repo.save(work.id, { expectedRevision: 1, answers: {}, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'submitted' });
    await expect(repo.submit(work.id, { expectedRevision: 1, requestKey: randomUUID() })).rejects.toMatchObject({ code: 'submitted' });
    expect((await repo.start()).id).toBe(work.id);
    expect((await repo.list()).history).toEqual([{ id: work.id, selectionVersion: 'balanced-ten-v1', submittedAt: receipt.submittedAt, answeredCount: 2, correctCount: 1, totalQuestions: 10 }]);
    const profile = await learning(owner).readSnapshot();
    expect(profile.sourceSummary).toMatchObject({ diagnosticItems: 2, independentItems: 2, releasedQuizItems: 0 });
    expect(profile.concepts.map(item => [item.conceptId, item.score])).toEqual([['concept-0', 60], ['concept-1', 40]]);
    for (const table of ['gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'quiz_score_evidence']) expect((await database.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    expect((await learning(owner).readSnapshot()).processing.processedSources).toBe(0);
  });

  it('keeps diagnostics usable while opted out, backfills after opt-in, and clears all derived evidence on renewed opt-out', async () => {
    const owner = await person(), repo = repository(owner); await consent(owner, true);
    const work = await repo.start();
    await repo.save(work.id, { expectedRevision: 0, answers: { [questions[0].versionId]: 'no' }, requestKey: randomUUID() });
    await repo.submit(work.id, { expectedRevision: 1, requestKey: randomUUID() });
    expect((await repo.read(work.id)).feedback?.answeredCount).toBe(1);
    expect((await database.query('SELECT * FROM learning_evidence_work WHERE user_id=$1', [owner])).rows).toEqual([]);
    expect(await learning(owner).readSnapshot()).toMatchObject({ optOut: true, concepts: [] });
    await consent(owner, false);
    expect((await learning(owner).readSnapshot()).concepts[0]).toMatchObject({ conceptId: 'concept-0', score: 40, independentItems: 1 });
    await consent(owner, true);
    for (const table of ['learning_evidence_sources', 'learning_evidence_work', 'learning_concept_estimates']) expect((await database.query(`SELECT * FROM ${table} WHERE user_id=$1`, [owner])).rows).toEqual([]);
    expect((await repo.read(work.id)).feedback?.correctCount).toBe(0);
  });

  it('does not count repeated frozen logical questions in future blueprint versions as independent evidence', async () => {
    const owner = await person();
    for (const [version, answer] of [['synthetic-v1', 'no'], ['synthetic-v2', 'yes']]) {
      const repo = repository(owner, database, version), work = await repo.start();
      await repo.save(work.id, { expectedRevision: 0, answers: { [questions[0].versionId]: answer }, requestKey: randomUUID() });
      await repo.submit(work.id, { expectedRevision: 1, requestKey: randomUUID() });
    }
    const snapshot = await learning(owner).readSnapshot();
    expect(snapshot.sourceSummary).toMatchObject({ diagnosticItems: 1, independentItems: 1 });
    expect(snapshot.concepts[0]).toMatchObject({ score: 60, independentItems: 1 });
  });

  it('rolls back finalization and outbox together when storing the receipt fails, then retries the same request', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start(), input = { expectedRevision: 0, requestKey: randomUUID() };
    await database.query(`CREATE FUNCTION synthetic_diagnostic_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.operation='submit' THEN RAISE EXCEPTION 'Synthetic lost receipt transaction'; END IF; RETURN NEW; END$$;
      CREATE TRIGGER synthetic_diagnostic_receipt_failure BEFORE INSERT ON practice_diagnostic_requests FOR EACH ROW EXECUTE FUNCTION synthetic_diagnostic_receipt_failure()`);
    try { await expect(repo.submit(work.id, input)).rejects.toThrow('Synthetic lost receipt transaction'); }
    finally { await database.query('DROP TRIGGER synthetic_diagnostic_receipt_failure ON practice_diagnostic_requests; DROP FUNCTION synthetic_diagnostic_receipt_failure()'); }
    expect((await repo.read(work.id)).submission).toBeNull();
    expect((await database.query('SELECT * FROM learning_evidence_work WHERE user_id=$1', [owner])).rows).toEqual([]);
    const receipt = await repo.submit(work.id, input);
    expect((await repo.read(work.id)).submission).toEqual(receipt);
    expect((await database.query('SELECT * FROM learning_evidence_work WHERE user_id=$1', [owner])).rows).toHaveLength(1);
    expect((await learning(owner).readSnapshot()).concepts).toEqual([]);
  });

  it('enforces frozen snapshots, exact server scoring and immutable finalized rows even for direct server SQL', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start();
    await expect(database.query('UPDATE practice_diagnostics SET selection_version=$2 WHERE id=$1', [work.id, 'forged-version'])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query("UPDATE practice_diagnostics SET answers=jsonb_build_object('forged','yes'),answer_revision=1 WHERE id=$1", [work.id])).rejects.toMatchObject({ code: '23514' });
    const row = (await database.query<{ snapshot: MultipleChoiceQuizSnapshot; answers: unknown }>('SELECT snapshot,answers FROM practice_diagnostics WHERE id=$1', [work.id])).rows[0];
    const score = scoreMultipleChoiceQuiz(row.snapshot, row.answers);
    await expect(database.query('UPDATE practice_diagnostics SET result=$2,submitted_at=clock_timestamp(),submit_request_key=$3 WHERE id=$1', [work.id, { ...score, earnedUnits: 1000, correctCount: 10 }, randomUUID()])).rejects.toMatchObject({ code: '23514' });
    await repo.submit(work.id, { expectedRevision: 0, requestKey: randomUUID() });
    await expect(database.query('UPDATE practice_diagnostics SET answer_revision=answer_revision+1 WHERE id=$1', [work.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query("UPDATE practice_diagnostic_requests SET response='{}' WHERE diagnostic_id=$1", [work.id])).rejects.toMatchObject({ code: '23514' });
  });

  it('allows final submission after the bounded save limit while preserving saved work', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start();
    await database.query(`INSERT INTO practice_diagnostic_requests(user_id,request_key,diagnostic_id,operation,input_fingerprint,response)
      SELECT $1,gen_random_uuid(),$2,'save',repeat('0',64),'{}' FROM generate_series(1,500)`, [owner, work.id]);
    await expect(repo.save(work.id, { expectedRevision: 0, answers: { [questions[0].versionId]: 'yes' }, requestKey: randomUUID() })).rejects.toBeInstanceOf(DiagnosticValidationError);
    expect((await repo.read(work.id)).answerDraft.revision).toBe(0);
    await expect(repo.submit(work.id, { expectedRevision: 0, requestKey: randomUUID() })).resolves.toMatchObject({ diagnosticId: work.id, answerRevision: 0 });
  });

  it('denies browser access and callable trigger helpers, and preserves RLS under accidental broad grants', async () => {
    const owner = await person(), work = await repository(owner).start();
    for (const table of ['practice_diagnostics', 'practice_diagnostic_requests']) {
      expect((await database.query<{ relrowsecurity: boolean }>('SELECT relrowsecurity FROM pg_class WHERE relname=$1', [table])).rows[0].relrowsecurity).toBe(true);
      for (const role of ['anon', 'authenticated']) expect((await database.query<{ allowed: boolean }>("SELECT has_table_privilege($1,$2,'SELECT') AS allowed", [role, table])).rows[0].allowed).toBe(false);
    }
    for (const name of ['diagnostic_validate_workspace', 'diagnostic_queue_evidence', 'diagnostic_remove_evidence', 'diagnostic_request_immutable']) {
      expect((await database.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed", [`${name}()`])).rows[0].allowed).toBe(false);
    }
    await expect(database.transaction(async client => {
      await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON practice_diagnostics,practice_diagnostic_requests TO authenticated');
      await client.query('SET LOCAL ROLE authenticated'); await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
      expect((await client.query('SELECT * FROM practice_diagnostics')).rows).toEqual([]);
      expect((await client.query('SELECT * FROM practice_diagnostic_requests')).rows).toEqual([]);
      await client.query("INSERT INTO practice_diagnostic_requests(user_id,request_key,diagnostic_id,operation,input_fingerprint,response)VALUES($1,$2,$3,'submit',repeat('0',64),'{}')", [owner, randomUUID(), work.id]);
    })).rejects.toMatchObject({ code: '42501' });
  });

  it('deletes private attempts, receipts and derived learning sources with the account', async () => {
    const owner = await person(), repo = repository(owner), work = await repo.start();
    await repo.save(work.id, { expectedRevision: 0, answers: { [questions[0].versionId]: 'yes' }, requestKey: randomUUID() });
    await repo.submit(work.id, { expectedRevision: 1, requestKey: randomUUID() }); await learning(owner).readSnapshot();
    await database.query('DELETE FROM users WHERE id=$1', [owner]);
    for (const table of ['practice_diagnostics', 'practice_diagnostic_requests', 'learning_evidence_sources', 'learning_evidence_work', 'learning_concept_estimates']) expect((await database.query(`SELECT * FROM ${table} WHERE user_id=$1`, [owner])).rows).toEqual([]);
    await expect(repo.read(work.id)).rejects.toBeInstanceOf(DiagnosticAccessError);
  });
});

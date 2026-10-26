import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import {
  AssessmentDraftAccessError, AssessmentDraftConflictError, AssessmentDraftValidationError,
  PostgresAssessmentDraftRepository, type AssessmentDraftInput,
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

async function person(role: 'learner' | 'instructor' | 'admin' = 'instructor') {
  const result = await database.query<{ id: string }>('INSERT INTO users (display_name, role) VALUES ($1,$2) RETURNING id', ['Synthetic Draft Author', role]);
  return result.rows[0].id;
}
async function fixture() {
  const userId = await person();
  const classroom = await new PostgresClassroomRepository(database, userId).createClass({ name: 'Draft authoring class', description: '', actorId: userId, reason: 'Synthetic authoring fixture' });
  return { userId, classId: classroom.id, repository: new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId }) };
}
const draft = (classId: string): AssessmentDraftInput => ({
  classId, title: 'Reasoning quiz draft', instructions: 'Choose the strongest invariant.',
  questions: [{ questionVersionId: 'pair-invariant@1', maxUnits: 125 }, { questionVersionId: 'window-boundary@1', maxUnits: 275 }],
  availableAt: '2026-10-26T09:00:00-04:00', dueAt: '2026-10-27T13:00:00.000Z', closesAt: '2026-10-28T13:00:00Z',
});
const mutation = (body: AssessmentDraftInput, requestKey = randomUUID()) => ({ draft: body, requestKey, reason: 'Prepare the class assessment' });

describe('private assessment draft storage', () => {
  it('round-trips ordered version references, exact points, and normalized dates through a fresh client without assigning learners', async () => {
    const { userId, classId, repository } = await fixture();
    const saved = await repository.createDraft({ ...mutation(draft(classId)), requestId: 'synthetic-create-request' });
    expect(saved).toMatchObject({ classId, title: 'Reasoning quiz draft', revision: 1, status: 'draft', maxUnits: 400, createdBy: userId,
      availableAt: '2026-10-26T13:00:00.000Z', dueAt: '2026-10-27T13:00:00.000Z', closesAt: '2026-10-28T13:00:00.000Z', questions: draft(classId).questions });
    const fresh = createDatabaseClient(config);
    try {
      const resumed = new PostgresAssessmentDraftRepository(fresh, { role: 'instructor', userId });
      expect(await resumed.getDraft(saved.id)).toEqual(saved);
      expect(await resumed.listDrafts(classId)).toEqual([saved]);
    } finally { await fresh.close(); }
    expect((await database.query('SELECT id FROM class_assignments')).rows).toHaveLength(0);
    expect((await database.query('SELECT id FROM gradebook_recipients')).rows).toHaveLength(0);
    const audit = await database.query<{ action: string; metadata: unknown; request_id: string }>("SELECT action, metadata, request_id FROM administration_audit_events WHERE action = 'assessments.draft.create'");
    expect(audit.rows).toEqual([{ action: 'assessments.draft.create', request_id: 'synthetic-create-request', metadata: { classId, revision: 1, questionCount: 2, maxUnits: 400 } }]);
    expect(JSON.stringify(saved)).not.toMatch(/correctOption|answerKey|explanation/);
  });

  it('denies other instructors and learner principals on every read and write path', async () => {
    const owner = await fixture(), other = await fixture();
    const saved = await owner.repository.createDraft(mutation(draft(owner.classId)));
    await expect(other.repository.getDraft(saved.id)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(other.repository.listDrafts(owner.classId)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(other.repository.createDraft(mutation(draft(owner.classId)))).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(other.repository.updateDraft({ ...mutation(draft(owner.classId)), draftId: saved.id, expectedRevision: 1 })).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    const learnerId = await person('learner');
    const forged = new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId: learnerId });
    await expect(forged.getDraft(saved.id)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    expect(await owner.repository.getDraft(saved.id)).toEqual(saved);
  });

  it('allows an active platform administrator across class scope while rejecting claimed or revoked administration access', async () => {
    const { repository, classId } = await fixture();
    const saved = await repository.createDraft(mutation(draft(classId)));
    const userId = await person('learner');
    const admin = new PostgresAssessmentDraftRepository(database, { role: 'administrator', userId });
    await expect(admin.getDraft(saved.id)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await database.query("INSERT INTO administration_role_assignments (user_id, role) VALUES ($1,'content_author'), ($1,'administrator')", [userId]);
    expect(await admin.getDraft(saved.id)).toEqual(saved);
    const input = { ...mutation({ ...draft(classId), title: 'Administrator edited draft' }), draftId: saved.id, expectedRevision: 1 };
    const updated = await admin.updateDraft(input);
    expect(updated).toMatchObject({ revision: 2, title: 'Administrator edited draft' });
    await database.query("UPDATE administration_role_assignments SET revoked_at = now() WHERE user_id=$1 AND role='administrator'", [userId]);
    await expect(admin.getDraft(saved.id)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(admin.updateDraft(input)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
  });

  it('does not grant platform scope from the legacy users.role label alone', async () => {
    const owner = await fixture();
    const id = await person('admin');
    const admin = new PostgresAssessmentDraftRepository(database, { role: 'administrator', userId: id });
    await expect(admin.createDraft(mutation(draft(owner.classId)))).rejects.toBeInstanceOf(AssessmentDraftAccessError);
  });

  it('creates one draft, receipt, and audit event when a save is retried concurrently', async () => {
    const { repository, classId } = await fixture();
    const input = mutation(draft(classId));
    const results = await Promise.all(Array.from({ length: 3 }, () => repository.createDraft(input)));
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(await repository.listDrafts(classId)).toHaveLength(1);
    expect((await database.query('SELECT draft_id FROM assessment_draft_mutations')).rows).toHaveLength(1);
    expect((await database.query("SELECT id FROM administration_audit_events WHERE action='assessments.draft.create'")).rows).toHaveLength(1);
  });

  it('returns the original receipt after later edits and rejects a changed payload under the same save key', async () => {
    const { repository, classId } = await fixture();
    const creation = mutation(draft(classId));
    const first = await repository.createDraft(creation);
    const update = { ...mutation({ ...draft(classId), questions: [...draft(classId).questions].reverse(), title: 'First saved edit' }), draftId: first.id, expectedRevision: 1 };
    const second = await repository.updateDraft(update);
    await repository.updateDraft({ ...mutation({ ...draft(classId), title: 'Latest saved edit' }), draftId: first.id, expectedRevision: 2 });
    expect(await repository.createDraft(creation)).toEqual(first);
    expect(await repository.updateDraft(update)).toEqual(second);
    await expect(repository.updateDraft({ ...update, draft: { ...update.draft, title: 'Changed retry' } })).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    expect((await repository.getDraft(first.id)).title).toBe('Latest saved edit');
    expect((await database.query('SELECT draft_id FROM assessment_draft_mutations')).rows).toHaveLength(3);
  });

  it('accepts one concurrent update of a revision and preserves the winner', async () => {
    const { repository, classId } = await fixture();
    const saved = await repository.createDraft(mutation(draft(classId)));
    const results = await Promise.allSettled(['First device edit', 'Second device edit'].map(title => repository.updateDraft({
      ...mutation({ ...draft(classId), title }), draftId: saved.id, expectedRevision: 1,
    })));
    const successes = results.filter(result => result.status === 'fulfilled');
    const failures = results.filter(result => result.status === 'rejected');
    expect(successes).toHaveLength(1); expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toMatchObject({ name: 'AssessmentDraftConflictError', currentRevision: 2 });
    const winner = successes[0] as PromiseFulfilledResult<Awaited<ReturnType<PostgresAssessmentDraftRepository['updateDraft']>>>;
    expect(await repository.getDraft(saved.id)).toEqual(winner.value);
  });

  it('cannot move a draft between classes even when the author can manage both', async () => {
    const { repository, classId, userId } = await fixture();
    const other = await new PostgresClassroomRepository(database, userId).createClass({ name: 'Other owned class', description: '', actorId: userId, reason: 'Synthetic second class' });
    const saved = await repository.createDraft(mutation(draft(classId)));
    await expect(repository.updateDraft({ ...mutation(draft(other.id)), draftId: saved.id, expectedRevision: 1 })).rejects.toBeInstanceOf(AssessmentDraftValidationError);
    expect(await repository.getDraft(saved.id)).toEqual(saved);
  });

  it('denies archived classes including retries of previously accepted saves', async () => {
    const { repository, classId } = await fixture();
    const input = mutation(draft(classId));
    const saved = await repository.createDraft(input);
    await database.query('UPDATE classrooms SET archived_at=now() WHERE id=$1', [classId]);
    await expect(repository.getDraft(saved.id)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(repository.listDrafts(classId)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(repository.createDraft(input)).rejects.toBeInstanceOf(AssessmentDraftAccessError);
    await expect(repository.updateDraft({ ...mutation(draft(classId)), draftId: saved.id, expectedRevision: 1 })).rejects.toBeInstanceOf(AssessmentDraftAccessError);
  });

  for (const operation of ['read', 'update'] as const) {
    it(`does not invert class/dependent locks when a class is deleted during a draft ${operation}`, async () => {
      const { repository, classId } = await fixture();
      const saved = await repository.createDraft(mutation(draft(classId)));
      const deletion = await database.getPool().connect();
      let result: Promise<unknown> | undefined;
      try {
        await deletion.query('BEGIN');
        await deletion.query("SET LOCAL lock_timeout = '3s'");
        const pid = (await deletion.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await deletion.query('SELECT id FROM classrooms WHERE id=$1 FOR UPDATE', [classId]);
        result = (operation === 'read' ? repository.getDraft(saved.id) : repository.updateDraft({
          ...mutation({ ...draft(classId), title: 'Edit racing deletion' }), draftId: saved.id, expectedRevision: 1,
        })).catch(error => error);
        await vi.waitFor(async () => {
          const blocked = await database.query('SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [pid]);
          expect(blocked.rows).toHaveLength(1);
        });
        // The dependent draft must remain unlocked while its parent is blocked.
        await deletion.query('DELETE FROM classrooms WHERE id=$1', [classId]);
        await deletion.query('COMMIT');
        expect(await result).toBeInstanceOf(AssessmentDraftAccessError);
      } finally {
        await deletion.query('ROLLBACK');
        deletion.release();
        await result;
      }
    });
  }

  it('does not retain a dependent draft lock while waiting for an author being deleted', async () => {
    const { repository, classId, userId } = await fixture();
    const saved = await repository.createDraft(mutation(draft(classId)));
    const deletion = await database.getPool().connect();
    let result: Promise<unknown> | undefined;
    try {
      await deletion.query('BEGIN');
      await deletion.query("SET LOCAL lock_timeout = '3s'");
      const pid = (await deletion.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await deletion.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      result = repository.getDraft(saved.id).catch(error => error);
      await vi.waitFor(async () => {
        const blocked = await database.query('SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [pid]);
        expect(blocked.rows).toHaveLength(1);
      });
      await deletion.query('DELETE FROM administration_audit_events WHERE actor_id=$1', [userId]);
      await deletion.query('DELETE FROM users WHERE id=$1', [userId]);
      await deletion.query('COMMIT');
      expect(await result).toBeInstanceOf(AssessmentDraftAccessError);
    } finally {
      await deletion.query('ROLLBACK');
      deletion.release();
      await result;
    }
  });

  it('rejects malformed, duplicate, excessive, or answer-bearing question payloads before saving', async () => {
    const { repository, classId } = await fixture();
    const base = draft(classId);
    const invalid = [
      [], Array.from({ length: 31 }, (_, index) => ({ questionVersionId: `question-${index}@1`, maxUnits: 1 })),
      [base.questions[0], base.questions[0]], [{ questionVersionId: 'pair-invariant', maxUnits: 100 }],
      [{ questionVersionId: 'pair-invariant@1', maxUnits: 0 }], [{ questionVersionId: 'pair-invariant@1', maxUnits: 0.5 }],
      [{ questionVersionId: 'pair-invariant@1', maxUnits: 1_000_001 }],
      [{ questionVersionId: 'pair-invariant@1', maxUnits: 1_000_000 }, { questionVersionId: 'window-boundary@1', maxUnits: 1 }],
      [{ questionVersionId: 'pair-invariant@1', maxUnits: 100, answerKey: 'option-b' }],
    ];
    for (const questions of invalid) {
      await expect(repository.createDraft(mutation({ ...base, questions }))).rejects.toBeInstanceOf(AssessmentDraftValidationError);
    }
    expect(await repository.listDrafts(classId)).toEqual([]);
    const maximum = await repository.createDraft(mutation({ ...base, questions: [{ questionVersionId: 'pair-invariant@1', maxUnits: 1_000_000 }] }));
    expect(maximum.maxUnits).toBe(1_000_000);
  });

  it('rejects impossible and out-of-order dates but accepts optional boundaries', async () => {
    const { repository, classId } = await fixture();
    const base = draft(classId);
    for (const overrides of [
      { availableAt: '2026-02-30T13:00:00Z' }, { availableAt: '2026-10-26T25:00:00Z' },
      { availableAt: '2026-10-26T13:00:00' }, { availableAt: '2026-10-29T13:00:00Z' },
      { dueAt: '2026-10-29T13:00:00Z' }, { dueAt: null, closesAt: '2026-10-25T13:00:00Z' },
    ]) await expect(repository.createDraft(mutation({ ...base, ...overrides }))).rejects.toBeInstanceOf(AssessmentDraftValidationError);
    const saved = await repository.createDraft(mutation({ ...base, availableAt: null, dueAt: null, closesAt: null }));
    expect(saved).toMatchObject({ availableAt: null, dueAt: null, closesAt: null });
  });

  it('keeps draft tables private to browser roles and enforces point/shape invariants in PostgreSQL', async () => {
    const { repository, classId, userId } = await fixture();
    const saved = await repository.createDraft(mutation(draft(classId)));
    const privileges = await database.query<{ relname: string; relrowsecurity: boolean; selectable: boolean }>(`SELECT relname, relrowsecurity,
      has_table_privilege('authenticated', oid, 'SELECT') AS selectable FROM pg_class WHERE relname IN ('assessment_drafts','assessment_draft_mutations') ORDER BY relname`);
    expect(privileges.rows).toHaveLength(2);
    expect(privileges.rows.every(row => row.relrowsecurity && !row.selectable)).toBe(true);
    for (const role of ['anon', 'authenticated']) {
      await expect(database.transaction(async client => {
        await client.query(`SET LOCAL ROLE ${role}`);
        await client.query('SELECT * FROM assessment_drafts');
      })).rejects.toMatchObject({ code: '42501' });
    }
    await expect(database.query('UPDATE assessment_draft_mutations SET fingerprint=$1 WHERE draft_id=$2', ['a'.repeat(64), saved.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query(`INSERT INTO assessment_drafts (class_id,title,questions,created_by) VALUES ($1,'Bad private answer payload',$2,$3)`,
      [classId, JSON.stringify([{ questionVersionId: 'pair-invariant@1', maxUnits: 100, correctOptionId: 'option-b' }]), userId])).rejects.toMatchObject({ code: '23502' });
    await expect(database.query("UPDATE assessment_drafts SET status='published' WHERE id=$1", [saved.id])).rejects.toMatchObject({ code: '23514' });
  });

  it('rolls back the draft and receipt when the transactional audit fails', async () => {
    const { repository, classId } = await fixture();
    await database.query(`CREATE FUNCTION assessment_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'assessments.draft.create' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER assessment_test_audit_failure BEFORE INSERT ON administration_audit_events FOR EACH ROW EXECUTE FUNCTION assessment_test_reject_audit()`);
    try {
      await expect(repository.createDraft(mutation(draft(classId)))).rejects.toThrow('Synthetic audit failure');
      expect(await repository.listDrafts(classId)).toEqual([]);
      expect((await database.query('SELECT * FROM assessment_draft_mutations')).rows).toEqual([]);
    } finally {
      await database.query('DROP TRIGGER assessment_test_audit_failure ON administration_audit_events; DROP FUNCTION assessment_test_reject_audit()');
    }
  });
});

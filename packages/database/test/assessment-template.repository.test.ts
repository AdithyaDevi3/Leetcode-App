import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { runner } from 'node-pg-migrate';
import { freezeQuestionVersion, freezeQuizQuestionSelection } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresQuizAssignmentRepository } from '../src/repositories/quiz-assignment.repository.js';
import { PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import { AssessmentDraftConflictError, PostgresAssessmentDraftRepository, type AssessmentDraftInput } from '../src/repositories/assessment-draft.repository.js';
import {
  AssessmentTemplateAccessError, AssessmentTemplateConflictError, AssessmentTemplateValidationError, PostgresAssessmentTemplateRepository,
  type AssessmentTemplateContent, type AssessmentTemplateCreateInput, type AssessmentTemplateUseInput,
} from '../src/repositories/assessment-template.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container: StartedTestContainer, database: DatabaseClient, config: DatabaseConfig;
beforeAll(async () => {
  container = await new GenericContainer('postgres:16-alpine').withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'testdb' }).withExposedPorts(5432).start();
  config = { host: container.getHost(), port: container.getMappedPort(5432), database: 'testdb', user: 'test', password: 'test' };
  database = createDatabaseClient(config); await prepareSupabaseTestDatabase(database); await runMigrations(config);
}, 60_000);
afterEach(async () => { if (database) await database.query('TRUNCATE users,classrooms CASCADE'); });
afterAll(async () => { await database?.close(); await container?.stop(); });
const versions = ['template-invariant@1', 'template-boundary@1'];
const original = (): AssessmentTemplateContent => ({ title: 'Synthetic saved template quiz', instructions: 'Choose the strongest invariant.',
  questions: [{ questionVersionId: versions[0], maxUnits: 125 }, { questionVersionId: versions[1], maxUnits: 375 }] });
const draft = (classId: string): AssessmentDraftInput => ({ ...original(), classId,
  availableAt: '2026-10-26T10:00:00Z', dueAt: '2026-10-27T10:00:00Z', closesAt: '2026-10-28T10:00:00Z' });
const command = () => ({ requestKey: randomUUID(), reason: 'Synthetic explicit template command' });
async function person(role: 'learner' | 'instructor' | 'admin' = 'instructor') {
  return (await database.query<{ id: string }>('INSERT INTO users(role,display_name) VALUES($1,$2) RETURNING id', [role, 'Synthetic template author'])).rows[0].id;
}
async function classroom(userId: string, name = 'Synthetic template class') {
  return new PostgresClassroomRepository(database, userId).createClass({ name, description: '', actorId: userId, reason: 'Synthetic template fixture class' });
}
async function fixture() {
  const userId = await person(), sourceClass = await classroom(userId, 'Source class'), destinationClass = await classroom(userId, 'Destination class');
  const drafts = new PostgresAssessmentDraftRepository(database, { role: 'instructor', userId });
  const source = await drafts.createDraft({ ...command(), draft: draft(sourceClass.id) });
  const repository = new PostgresAssessmentTemplateRepository(database, { role: 'instructor', userId });
  const creation: AssessmentTemplateCreateInput = { ...command(), sourceDraftId: source.id, sourceClassId: sourceClass.id, expectedRevision: 1 };
  const template = await repository.createFromDraft(creation, versions);
  const use: AssessmentTemplateUseInput = { ...command(), templateId: template.id, version: 1, expectedRevision: 1, destinationClassId: destinationClass.id };
  return { userId, sourceClass, destinationClass, drafts, source, repository, creation, template, use };
}

describe('private versioned assessment templates', () => {
  it('captures only saved content into a creator-owned immutable first version, without assigning work', async () => {
    const f = await fixture();
    expect(f.template).toMatchObject({ ...original(), revision: 1, currentVersion: 1, version: 1, status: 'active', maxUnits: 500 });
    expect(f.template.id).not.toBe(f.source.id);
    const fresh = createDatabaseClient(config);
    try { expect(await new PostgresAssessmentTemplateRepository(fresh, { role: 'instructor', userId: f.userId }).getTemplate(f.template.id)).toEqual(f.template); }
    finally { await fresh.close(); }
    expect(JSON.stringify(f.template)).not.toMatch(/owner_id|sourceClassId|classId|availableAt|dueAt|closesAt|correctOptionId|learnerId/);
    for (const table of ['class_assignments', 'gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'quiz_publications']) expect((await database.query(`SELECT id FROM ${table}`)).rows).toEqual([]);
    expect(await f.drafts.getDraft(f.source.id)).toEqual(f.source);
    const audit = (await database.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM administration_audit_events WHERE action='assessments.template.create'")).rows[0].metadata;
    expect(audit).toEqual({ revision: 1, version: 1, questionCount: 2, maxUnits: 500, sourceDraftId: f.source.id, sourceClassId: f.sourceClass.id, sourceRevision: 1 });
    expect(JSON.stringify(audit)).not.toContain(f.source.instructions);
  });

  it('keeps all three tables and helper functions inaccessible to browser roles', async () => {
    await fixture();
    for (const table of ['assessment_templates', 'assessment_template_versions', 'assessment_template_mutations']) {
      expect((await database.query<{ relrowsecurity: boolean }>('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass', [table])).rows[0].relrowsecurity).toBe(true);
      for (const role of ['anon', 'authenticated']) {
        expect((await database.query<{ allowed: boolean }>("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS allowed", [role, table])).rows[0].allowed).toBe(false);
      }
    }
    for (const name of ['assessment_template_guard_head', 'assessment_template_reject_version_change', 'assessment_template_reject_receipt_change']) {
      for (const role of ['anon', 'authenticated']) expect((await database.query<{ allowed: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, `${name}()`])).rows[0].allowed).toBe(false);
      expect((await database.query<{ prosecdef: boolean }>('SELECT prosecdef FROM pg_proc WHERE oid=$1::regprocedure', [`${name}()`])).rows[0].prosecdef).toBe(false);
    }
    const browser = await database.getPool().connect();
    try { await browser.query('SET ROLE anon'); await expect(browser.query('SELECT * FROM assessment_templates')).rejects.toMatchObject({ code: '42501' }); }
    finally { await browser.query('RESET ROLE'); browser.release(); }
  });

  it('never grants another creator private template access, including for active administrators', async () => {
    const f = await fixture(), otherId = await person(), adminId = await person('learner');
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [adminId]);
    const foreign = [new PostgresAssessmentTemplateRepository(database, { role: 'instructor', userId: otherId }), new PostgresAssessmentTemplateRepository(database, { role: 'administrator', userId: adminId })];
    for (const repository of foreign) {
      expect(await repository.listTemplates({ search: '', status: 'all', page: 1 })).toEqual({ items: [], total: 0 });
      await expect(repository.getTemplate(f.template.id)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
      await expect(repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: original() }, versions)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
      await expect(repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 1, archived: true })).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
      await expect(repository.createDraft(f.use, versions)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    }
    const admin = foreign[1];
    const own = await admin.createFromDraft({ ...f.creation, ...command() }, versions);
    expect((await admin.listTemplates({ search: '', status: 'all', page: 1 })).items.map(item => item.id)).toEqual([own.id]);
  });

  it('requires current stored author roles and current administrator capabilities on reads and receipt replay', async () => {
    const f = await fixture();
    await database.query("UPDATE users SET role='learner' WHERE id=$1", [f.userId]);
    await expect(f.repository.getTemplate(f.template.id)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    await expect(f.repository.createFromDraft(f.creation, [])).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    const adminId = await person('admin'), admin = new PostgresAssessmentTemplateRepository(database, { role: 'administrator', userId: adminId });
    await expect(admin.listTemplates({ search: '', status: 'all', page: 1 })).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'content_author')", [adminId]);
    await expect(admin.listTemplates({ search: '', status: 'all', page: 1 })).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    await database.query("INSERT INTO administration_role_assignments(user_id,role) VALUES($1,'administrator')", [adminId]);
    const input = { ...f.creation, ...command() }, own = await admin.createFromDraft(input, versions);
    await database.query("UPDATE administration_role_assignments SET revoked_at=now() WHERE user_id=$1 AND role='administrator'", [adminId]);
    await expect(admin.getTemplate(own.id)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    await expect(admin.createFromDraft(input, [])).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
  });

  it('creates new immutable content versions while preserving selected historical previews', async () => {
    const f = await fixture();
    const next = { ...original(), title: 'Edited template version', questions: [...original().questions].reverse() };
    const edited = await f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: next }, versions);
    expect(edited).toMatchObject({ ...next, revision: 2, version: 2, currentVersion: 2 });
    const history = await f.repository.getTemplate(f.template.id, 1);
    expect(history).toMatchObject({ ...original(), revision: 2, version: 1, currentVersion: 2, versionCreatedAt: f.template.versionCreatedAt });
    expect(await f.repository.getTemplate(f.template.id)).toEqual(edited);
    await expect(f.repository.getTemplate(f.template.id, 3)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
  });

  it('does not expose or use a stray future version beyond the authorized head', async () => {
    const f = await fixture();
    await database.query('INSERT INTO assessment_template_versions(template_id,version,title,instructions,questions) VALUES($1,2,$2,$3,$4::jsonb)',
      [f.template.id, 'Unreferenced future version', '', JSON.stringify(original().questions)]);
    await expect(f.repository.getTemplate(f.template.id, 2)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    await expect(f.repository.createDraft({ ...f.use, version: 2 }, versions)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    expect(await f.drafts.listDrafts(f.destinationClass.id)).toEqual([]);
  });

  it('archives and restores a head without modifying its content version, including explicit same-state commands', async () => {
    const f = await fixture();
    const archived = await f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 1, archived: true });
    expect(archived).toMatchObject({ status: 'archived', revision: 2, currentVersion: 1, version: 1 });
    expect(await f.repository.getTemplate(f.template.id, 1)).toEqual(archived);
    await expect(f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 2, content: original() }, versions)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    await expect(f.repository.createDraft({ ...f.use, expectedRevision: 2 }, versions)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    const same = await f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 2, archived: true });
    const restored = await f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 3, archived: false });
    expect(same.revision).toBe(3); expect(restored).toMatchObject({ revision: 4, status: 'active', currentVersion: 1, version: 1 });
    expect(restored.questions).toEqual(f.template.questions);
  });

  it('serializes concurrent creation retries and recovers the first receipt after source changes or retirement', async () => {
    const f = await fixture();
    const repeated = { ...f.creation, ...command() };
    const results = await Promise.all(Array.from({ length: 3 }, () => f.repository.createFromDraft(repeated, versions)));
    for (const result of results) expect(result).toEqual(results[0]);
    await f.drafts.updateDraft({ ...command(), draftId: f.source.id, expectedRevision: 1, draft: { ...draft(f.sourceClass.id), title: 'Later saved source' } });
    await f.repository.updateTemplate({ ...command(), templateId: results[0].id, expectedRevision: 1, content: { ...original(), title: 'Later template edit' } }, versions);
    await f.repository.setArchived({ ...command(), templateId: results[0].id, expectedRevision: 2, archived: true });
    expect(await f.repository.createFromDraft(repeated, [])).toEqual(results[0]);
    expect((await database.query('SELECT template_id FROM assessment_template_mutations WHERE request_key=$1', [repeated.requestKey])).rows).toHaveLength(1);
  });

  it('preserves original update and archive receipts after later versions and status changes', async () => {
    const f = await fixture();
    const edit = { ...command(), templateId: f.template.id, expectedRevision: 1, content: { ...original(), title: 'First accepted version' } };
    const accepted = await f.repository.updateTemplate(edit, versions);
    const archive = { ...command(), templateId: f.template.id, expectedRevision: 2, archived: true };
    const archived = await f.repository.setArchived(archive);
    await f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 3, archived: false });
    await f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 4, content: { ...original(), title: 'Latest version after restore' } }, versions);
    expect(await f.repository.updateTemplate(edit, [])).toEqual(accepted);
    expect(await f.repository.setArchived(archive)).toEqual(archived);
    expect((await f.repository.getTemplate(f.template.id)).revision).toBe(5);
  });

  it('rejects stale or changed template commands and shares the template mutation key namespace', async () => {
    const f = await fixture();
    const edit = { ...command(), templateId: f.template.id, expectedRevision: 1, content: original() };
    await f.repository.updateTemplate(edit, versions);
    await expect(f.repository.updateTemplate({ ...edit, content: { ...original(), title: 'Changed retry' } }, versions)).rejects.toBeInstanceOf(AssessmentTemplateConflictError);
    await expect(f.repository.setArchived({ ...edit, archived: true } as never)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    await expect(f.repository.setArchived({ requestKey: edit.requestKey, reason: edit.reason, templateId: f.template.id, expectedRevision: 2, archived: true })).rejects.toBeInstanceOf(AssessmentTemplateConflictError);
    await expect(f.repository.createFromDraft({ ...f.creation, requestKey: edit.requestKey }, versions)).rejects.toBeInstanceOf(AssessmentTemplateConflictError);
    await expect(f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: original() }, versions)).rejects.toMatchObject({ currentRevision: 2 });
  });

  it('accepts one concurrent edit per expected head revision and retains the winning immutable version', async () => {
    const f = await fixture();
    const results = await Promise.allSettled(['First device template', 'Second device template'].map(title => f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: { ...original(), title } }, versions)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await database.query('SELECT version FROM assessment_template_versions WHERE template_id=$1', [f.template.id])).rows).toHaveLength(2);
    expect((await f.repository.getTemplate(f.template.id)).revision).toBe(2);
  });

  it('uses an explicitly selected historical version to create a separate normal private draft with cleared dates', async () => {
    const f = await fixture();
    await f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: { ...original(), title: 'Newer template version', questions: [...original().questions].reverse() } }, versions);
    const saved = await f.repository.createDraft({ ...f.use, expectedRevision: 2 }, versions);
    expect(saved).toMatchObject({ ...original(), classId: f.destinationClass.id, revision: 1, status: 'draft', maxUnits: 500, createdBy: f.userId,
      availableAt: null, dueAt: null, closesAt: null });
    expect(saved.id).not.toBe(f.source.id); expect(saved.id).not.toBe(f.template.id);
    expect((await database.query('SELECT id FROM class_assignments')).rows).toEqual([]);
    expect((await database.query('SELECT id FROM gradebook_recipients')).rows).toEqual([]);
  });

  it('serializes canonical template-use retries and recovers the exact original draft after edits, archive and retirement', async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 4 }, (_, index) => f.repository.createDraft(index % 2 ? { ...f.use, templateId: f.use.templateId.toUpperCase(), destinationClassId: f.use.destinationClassId.toUpperCase() } : f.use, versions)));
    for (const saved of results) expect(saved).toEqual(results[0]);
    await f.drafts.updateDraft({ ...command(), draftId: results[0].id, expectedRevision: 1, draft: { ...draft(f.destinationClass.id), title: 'Edited existing template draft' } });
    await f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: { ...original(), title: 'Later template content' } }, versions);
    await f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 2, archived: true });
    expect(await f.repository.createDraft(f.use, [])).toEqual(results[0]);
    expect(await f.drafts.listDrafts(f.destinationClass.id)).toHaveLength(1);
    expect((await database.query('SELECT draft_id FROM assessment_draft_mutations WHERE request_key=$1', [f.use.requestKey])).rows).toHaveLength(1);
    expect((await database.query("SELECT id FROM administration_audit_events WHERE action='assessments.template.use'")).rows).toHaveLength(1);
  });

  it('shares template-use request keys with ordinary create, update and copy commands', async () => {
    const f = await fixture();
    const saved = await f.repository.createDraft(f.use, versions);
    await expect(f.drafts.createDraft({ ...command(), requestKey: f.use.requestKey, draft: draft(f.destinationClass.id) })).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    await expect(f.drafts.updateDraft({ ...command(), requestKey: f.use.requestKey, draftId: saved.id, expectedRevision: 1, draft: draft(f.destinationClass.id) })).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    await expect(f.drafts.copyDraft({ ...command(), requestKey: f.use.requestKey, sourceClassId: f.sourceClass.id, sourceDraftId: f.source.id, expectedRevision: 1, destinationClassId: f.destinationClass.id }, versions)).rejects.toBeInstanceOf(AssessmentDraftConflictError);
    const creation = { ...command(), draft: draft(f.destinationClass.id) }; await f.drafts.createDraft(creation);
    await expect(f.repository.createDraft({ ...f.use, requestKey: creation.requestKey }, versions)).rejects.toBeInstanceOf(AssessmentTemplateConflictError);
    await expect(f.repository.createDraft({ ...f.use, version: 2 }, versions)).rejects.toBeInstanceOf(AssessmentTemplateConflictError);
  });

  it('independently rechecks destination and source authority on new commands and accepted receipts', async () => {
    const f = await fixture(), otherId = await person(), foreignClass = await classroom(otherId);
    const saved = await f.repository.createDraft(f.use, versions);
    await expect(f.repository.createDraft({ ...f.use, ...command(), destinationClassId: foreignClass.id }, versions)).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    for (const changes of [{ archived_at: true }, { owner: true }]) {
      if ('archived_at' in changes) await database.query('UPDATE classrooms SET archived_at=now() WHERE id=$1', [f.destinationClass.id]);
      else await database.query('UPDATE classrooms SET archived_at=NULL,created_by=$2 WHERE id=$1', [f.destinationClass.id, otherId]);
      await expect(f.repository.createDraft(f.use, [])).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    }
    await database.query('UPDATE classrooms SET created_by=$2 WHERE id=$1', [f.destinationClass.id, f.userId]);
    expect(await f.repository.createDraft(f.use, [])).toEqual(saved);
    await database.query('UPDATE classrooms SET archived_at=now() WHERE id=$1', [f.sourceClass.id]);
    await expect(f.repository.createFromDraft(f.creation, [])).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
  });

  it('keeps captured content independent of a later deleted source class while preserving owner checks', async () => {
    const f = await fixture();
    await database.query('DELETE FROM classrooms WHERE id=$1', [f.sourceClass.id]);
    expect(await f.repository.getTemplate(f.template.id)).toEqual(f.template);
    expect((await f.repository.createDraft(f.use, versions)).questions).toEqual(f.template.questions);
    await expect(f.repository.createFromDraft(f.creation, [])).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
  });

  it('requires exact reviewed versions without silently upgrading or dropping logical duplicates', async () => {
    const f = await fixture();
    const changed = { ...original(), questions: [{ questionVersionId: 'template-invariant@2', maxUnits: 500 }] };
    await expect(f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: changed }, versions)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    await expect(f.repository.createDraft(f.use, [versions[0]])).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    await expect(f.repository.createFromDraft({ ...f.creation, ...command() }, ['template-invariant@2', versions[1]])).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    const duplicate = { ...original(), questions: [{ questionVersionId: 'template-invariant@1', maxUnits: 125 }, { questionVersionId: 'template-invariant@2', maxUnits: 375 }] };
    await expect(f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: duplicate }, [...versions, 'template-invariant@2'])).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    const source = await f.drafts.updateDraft({ ...command(), draftId: f.source.id, expectedRevision: 1, draft: { ...draft(f.sourceClass.id), questions: duplicate.questions } });
    await expect(f.repository.createFromDraft({ ...f.creation, ...command(), expectedRevision: source.revision }, [...versions, 'template-invariant@2'])).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    expect((await f.repository.getTemplate(f.template.id)).revision).toBe(1);
  });

  it('paginates all matching private templates with literal search and active/archived filters', async () => {
    const f = await fixture();
    for (let index = 0; index < 24; index++) await f.repository.createFromDraft({ ...f.creation, ...command() }, versions);
    const first = await f.repository.listTemplates({ search: '', status: 'all', page: 1 }), second = await f.repository.listTemplates({ search: '', status: 'all', page: 2 });
    expect(first.total).toBe(25); expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(25);
    const edited = await f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: { ...original(), title: 'Literal 100%_ review', instructions: 'Unusual NEEDLE text' } }, versions);
    for (const search of ['%', '_', 'needle']) expect((await f.repository.listTemplates({ search, status: 'all', page: 1 })).items.map(item => item.id)).toEqual([f.template.id]);
    await f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: edited.revision, archived: true });
    expect((await f.repository.listTemplates({ search: '', status: 'active', page: 1 })).total).toBe(24);
    expect((await f.repository.listTemplates({ search: '', status: 'archived', page: 1 })).total).toBe(1);
    expect(await f.repository.listTemplates({ search: '', status: 'all', page: 3 })).toEqual({ items: [], total: 25 });
    expect(Object.keys(first.items[0]).sort()).toEqual(['currentVersion', 'id', 'maxUnits', 'questionCount', 'revision', 'status', 'title', 'updatedAt']);
  });

  it('rejects direct version/receipt mutation and owner reassignment while permitting owner deletion cascades', async () => {
    const f = await fixture(), otherId = await person();
    await f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: { ...original(), title: 'Second immutable version' } }, versions);
    await expect(database.query("UPDATE assessment_template_versions SET title='Forged edit' WHERE template_id=$1", [f.template.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query('DELETE FROM assessment_template_versions WHERE template_id=$1 AND version=1', [f.template.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query("UPDATE assessment_template_mutations SET snapshot='{}'::jsonb WHERE template_id=$1", [f.template.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query('DELETE FROM assessment_template_mutations WHERE template_id=$1', [f.template.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query('UPDATE assessment_templates SET owner_id=$2,revision=revision+1 WHERE id=$1', [f.template.id, otherId])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query('UPDATE assessment_templates SET revision=revision+2 WHERE id=$1', [f.template.id])).rejects.toMatchObject({ code: '23514' });
    await expect(database.query('INSERT INTO assessment_templates(owner_id,revision,current_version) VALUES($1,1,2)', [f.userId])).rejects.toMatchObject({ code: '23514' });
    await database.query('DELETE FROM assessment_templates WHERE id=$1', [f.template.id]);
    // The existing audit ledger deliberately retains audited actor identities.
    // Exercise owner cascades with an otherwise unreferenced synthetic owner.
    const bareOwner = await person();
    await database.transaction(async client => {
      const head = (await client.query<{ id: string }>('INSERT INTO assessment_templates(owner_id) VALUES($1) RETURNING id', [bareOwner])).rows[0].id;
      await client.query('INSERT INTO assessment_template_versions(template_id,version,title,instructions,questions) VALUES($1,1,$2,$3,$4::jsonb)', [head, 'Synthetic cascade template', '', JSON.stringify(original().questions)]);
      await client.query('INSERT INTO assessment_template_mutations(actor_id,request_key,template_id,fingerprint,snapshot) VALUES($1,$2,$3,$4,$5)', [bareOwner, randomUUID(), head, '0'.repeat(64), {}]);
    });
    await database.query('DELETE FROM users WHERE id=$1', [bareOwner]);
    for (const table of ['assessment_templates', 'assessment_template_versions', 'assessment_template_mutations']) expect((await database.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
  });

  it('takes the destination class lock before the template when a concurrent parent deletion is pending', async () => {
    const f = await fixture(), deleting = await database.getPool().connect(); let result: Promise<unknown> | undefined;
    try {
      await deleting.query('BEGIN'); await deleting.query("SET LOCAL lock_timeout='3s'");
      const pid = (await deleting.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await deleting.query('SELECT id FROM classrooms WHERE id=$1 FOR UPDATE', [f.destinationClass.id]);
      result = f.repository.createDraft(f.use, versions).catch(error => error);
      await vi.waitFor(async () => expect((await database.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [pid])).rows).toHaveLength(1));
      await deleting.query('DELETE FROM assessment_templates WHERE id=$1', [f.template.id]);
      await deleting.query('DELETE FROM classrooms WHERE id=$1', [f.destinationClass.id]); await deleting.query('COMMIT');
      expect(await result).toBeInstanceOf(AssessmentTemplateAccessError);
    } finally { await deleting.query('ROLLBACK'); deleting.release(); await result; }
  });

  it('preserves existing publication, audience, submissions and released grades when capturing and using a saved revision', async () => {
    const f = await fixture(), learnerId = await person('learner');
    await new PostgresClassroomRepository(database, f.userId).joinClassByCode({ userId: learnerId, code: f.sourceClass.joinCode });
    await f.drafts.updateDraft({ ...command(), draftId: f.source.id, expectedRevision: 1, draft: { ...draft(f.sourceClass.id), availableAt: null, dueAt: null, closesAt: null } });
    const author = new PostgresQuizAssignmentRepository(database, { role: 'instructor', userId: f.userId });
    const questions = original().questions.map(item => ({ maxUnits: item.maxUnits, question: freezeQuestionVersion({ questionId: item.questionVersionId.split('@')[0], version: 1, versionId: item.questionVersionId,
      kind: 'multiple_choice', status: 'reviewed', title: 'Synthetic template question', prompt: 'Choose the preserved invariant.', difficulty: 'foundation', activityIds: ['synthetic-template-practice'], conceptIds: ['hash-maps'],
      options: [{ id: 'yes', text: 'Preserved.', misconceptionTags: [] }, { id: 'no', text: 'Broken.', misconceptionTags: ['synthetic-error'] }], correctOptionId: 'yes', explanation: 'Synthetic explanation.',
      provenance: { kind: 'original', authorId: 'synthetic-template-author', authoredAt: '2026-10-26T10:00:00.000Z' }, review: { reviewerId: 'synthetic-template-reviewer', reviewedAt: '2026-10-26T11:00:00.000Z', notes: 'Synthetic independent content review.' } }) }));
    const authoring = await author.readAuthorDraft(f.source.id);
    const publication = await author.publishDraft({ ...command(), draftId: f.source.id, expectedRevision: 2, expectedRosterFingerprint: authoring.rosterFingerprint,
      audience: { kind: 'class', learnerIds: [learnerId] }, snapshot: freezeQuizQuestionSelection(questions) });
    const recipientId = (await database.query<{ id: string }>('SELECT id FROM gradebook_recipients WHERE policy_id=$1', [publication.policyVersionId])).rows[0].id;
    const learner = new PostgresQuizAssignmentRepository(database, { role: 'learner', userId: learnerId });
    await learner.saveAnswers({ recipientId, expectedRevision: 0, answers: Object.fromEntries(versions.map(version => [version, 'yes'])), requestKey: randomUUID() });
    await learner.submitQuiz({ recipientId, expectedRevision: 1, requestKey: randomUUID() });
    const scored = await author.readInstructorQuiz(recipientId);
    await new PostgresGradebookRepository(database, { role: 'instructor', userId: f.userId }).publishGrade({ ...command(), recipientId, gradeRevisionId: scored.grade!.id, expectedPublicationSequence: 0 });
    const edited = await f.drafts.updateDraft({ ...command(), draftId: f.source.id, expectedRevision: 2, draft: { ...draft(f.sourceClass.id), title: 'Saved content after publication', questions: [...original().questions].reverse() } });
    const tables = ['quiz_publications', 'class_assignments', 'gradebook_recipients', 'gradebook_attempts', 'gradebook_grade_revisions', 'gradebook_publications'];
    const before = await Promise.all(tables.map(async table => (await database.query(`SELECT * FROM ${table} ORDER BY id`)).rows));
    const captured = await f.repository.createFromDraft({ ...f.creation, ...command(), expectedRevision: 3 }, versions);
    const used = await f.repository.createDraft({ ...f.use, ...command(), templateId: captured.id }, versions);
    expect(used.questions).toEqual(edited.questions); expect(used.title).toBe(edited.title);
    expect(await Promise.all(tables.map(async table => (await database.query(`SELECT * FROM ${table} ORDER BY id`)).rows))).toEqual(before);
    expect((await author.readAuthorDraft(used.id)).publication).toBeNull();
    expect(await learner.readLearnerQuiz(recipientId)).toMatchObject({ title: f.source.title, releasedGrade: { earnedUnits: 500 } });
  });

  it('rejects invalid commands and point/content shapes before writing template or draft records', async () => {
    const f = await fixture();
    for (const changes of [{ expectedRevision: 0 }, { expectedRevision: 1.25 }, { requestKey: '' }, { requestKey: 'x'.repeat(129) }, { reason: 'short' }, { requestId: 'x'.repeat(101) }, { audience: [] }]) {
      await expect(f.repository.createFromDraft({ ...f.creation, ...changes } as never, versions)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    }
    for (const bad of [{ ...original(), title: 'x' }, { ...original(), instructions: 'x'.repeat(2001) }, { ...original(), questions: [] },
      { ...original(), questions: [{ questionVersionId: versions[0], maxUnits: 0.5 }] }, { ...original(), questions: [{ questionVersionId: versions[0], maxUnits: 1_000_001 }] },
      { ...original(), questions: [{ questionVersionId: versions[0], maxUnits: 600_000 }, { questionVersionId: versions[1], maxUnits: 600_000 }] }]) {
      await expect(f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: bad }, versions)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    }
    await expect(f.repository.getTemplate('invalid')).rejects.toBeInstanceOf(AssessmentTemplateAccessError);
    await expect(f.repository.getTemplate(f.template.id, 0)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    await expect(f.repository.listTemplates({ search: '', status: 'all', page: 0 })).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    await expect(f.repository.setArchived({ ...command(), templateId: f.template.id, expectedRevision: 1, archived: 'yes' } as never)).rejects.toBeInstanceOf(AssessmentTemplateValidationError);
    expect((await f.repository.getTemplate(f.template.id)).revision).toBe(1); expect(await f.drafts.listDrafts(f.destinationClass.id)).toEqual([]);
  });

  it('refuses to reverse template storage after content has been saved and retains the exact history', async () => {
    const f = await fixture();
    const applied = await database.query<{ count: string }>("SELECT count(*)::text AS count FROM pgmigrations WHERE name >= '1793570504674_private-assessment-templates'");
    const count = Number(applied.rows[0].count); expect(count).toBeGreaterThan(0);
    await expect(runner({ databaseUrl: `postgresql://test:test@${config.host}:${config.port}/testdb`,
      dir: 'migrations', migrationsTable: 'pgmigrations', count, direction: 'down', singleTransaction: true })).rejects.toThrow('forward-only');
    expect(await f.repository.getTemplate(f.template.id)).toEqual(f.template);
    expect((await database.query('SELECT template_id FROM assessment_template_mutations WHERE request_key=$1', [f.creation.requestKey])).rows).toEqual([{ template_id: f.template.id }]);
  });

  it('rolls back versions, heads, receipts and created drafts when template audit recording fails', async () => {
    const f = await fixture();
    await database.query(`CREATE FUNCTION template_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action LIKE 'assessments.template.%' THEN RAISE EXCEPTION 'Synthetic template audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER template_test_audit_failure BEFORE INSERT ON administration_audit_events FOR EACH ROW EXECUTE FUNCTION template_test_audit_failure()`);
    try {
      await expect(f.repository.updateTemplate({ ...command(), templateId: f.template.id, expectedRevision: 1, content: original() }, versions)).rejects.toThrow('Synthetic template audit failure');
      await expect(f.repository.createDraft(f.use, versions)).rejects.toThrow('Synthetic template audit failure');
      await expect(f.repository.createFromDraft({ ...f.creation, ...command() }, versions)).rejects.toThrow('Synthetic template audit failure');
      expect(await f.repository.getTemplate(f.template.id)).toEqual(f.template);
      expect((await database.query('SELECT id FROM assessment_templates')).rows).toHaveLength(1);
      expect((await database.query('SELECT version FROM assessment_template_versions')).rows).toHaveLength(1);
      expect((await database.query('SELECT template_id FROM assessment_template_mutations')).rows).toHaveLength(1);
      expect(await f.drafts.listDrafts(f.destinationClass.id)).toEqual([]);
      expect((await database.query('SELECT draft_id FROM assessment_draft_mutations WHERE request_key=$1', [f.use.requestKey])).rows).toEqual([]);
    } finally { await database.query('DROP TRIGGER template_test_audit_failure ON administration_audit_events; DROP FUNCTION template_test_audit_failure()'); }
  });
});

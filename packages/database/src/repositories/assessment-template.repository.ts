import { createHash } from 'node:crypto';
import { canPerformAdministrationAction, type AdministrationRole } from '@leetcode-app/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import type { DatabaseClient } from '../client.js';
import type { AssessmentDraftPrincipal, AssessmentDraftQuestion, StoredAssessmentDraft } from './assessment-draft.repository.js';

export type AssessmentTemplateContent = { title: string; instructions: string; questions: readonly AssessmentDraftQuestion[] };
export type AssessmentTemplateStatus = 'active' | 'archived';
export type StoredAssessmentTemplate = AssessmentTemplateContent & {
  id: string; revision: number; status: AssessmentTemplateStatus; currentVersion: number; version: number;
  maxUnits: number; createdAt: string; updatedAt: string; versionCreatedAt: string;
};
export type AssessmentTemplateSummary = {
  id: string; revision: number; status: AssessmentTemplateStatus; currentVersion: number;
  title: string; questionCount: number; maxUnits: number; updatedAt: string;
};
type Command = { requestKey: string; reason: string; requestId?: string | null };
export type AssessmentTemplateCreateInput = Command & { sourceDraftId: string; sourceClassId: string; expectedRevision: number };
export type AssessmentTemplateUpdateInput = Command & { templateId: string; expectedRevision: number; content: AssessmentTemplateContent };
export type AssessmentTemplateArchiveInput = Command & { templateId: string; expectedRevision: number; archived: boolean };
export type AssessmentTemplateUseInput = Command & { templateId: string; version: number; expectedRevision: number; destinationClassId: string };

export class AssessmentTemplateAccessError extends Error {
  constructor() { super('Template, draft or class not found.'); this.name = 'AssessmentTemplateAccessError'; }
}
export class AssessmentTemplateConflictError extends Error {
  constructor(readonly currentRevision?: number) { super('The template changed or this request key was already used.'); this.name = 'AssessmentTemplateConflictError'; }
}
export class AssessmentTemplateValidationError extends Error {
  constructor(message = 'The template command is invalid.') { super(message); this.name = 'AssessmentTemplateValidationError'; }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const versionId = /^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/;
const iso = (value: string | Date) => new Date(value).toISOString();
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new AssessmentTemplateAccessError();
  return value.toLowerCase();
}
function positive(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2_147_483_647) throw new AssessmentTemplateValidationError('A valid version or revision is required.');
}
function fields(value: unknown, allowed: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !allowed.includes(key))) throw new AssessmentTemplateValidationError();
}
function command(input: Command, allowed: readonly string[]): Required<Command> {
  fields(input, [...allowed, 'requestKey', 'reason', 'requestId']);
  if (typeof input.requestKey !== 'string' || !input.requestKey.trim() || input.requestKey.length > 128
    || typeof input.reason !== 'string' || input.reason.trim().length < 8 || input.reason.trim().length > 500
    || (input.requestId !== undefined && input.requestId !== null && (typeof input.requestId !== 'string' || input.requestId.length > 100))) throw new AssessmentTemplateValidationError();
  return { requestKey: input.requestKey.trim(), reason: input.reason.trim(), requestId: input.requestId ?? null };
}
function content(input: AssessmentTemplateContent): AssessmentTemplateContent {
  fields(input, ['title', 'instructions', 'questions']);
  if (Object.keys(input).length !== 3 || typeof input.title !== 'string' || input.title.trim().length < 3 || input.title.trim().length > 160
    || typeof input.instructions !== 'string' || input.instructions.length > 2000 || !Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 30) throw new AssessmentTemplateValidationError();
  const logical = new Set<string>(); let total = 0;
  const questions = input.questions.map(question => {
    fields(question, ['questionVersionId', 'maxUnits']);
    if (Object.keys(question).length !== 2 || typeof question.questionVersionId !== 'string' || !versionId.test(question.questionVersionId)
      || logical.has(question.questionVersionId.split('@')[0]) || !Number.isSafeInteger(question.maxUnits) || question.maxUnits < 1 || question.maxUnits > 1_000_000) throw new AssessmentTemplateValidationError();
    logical.add(question.questionVersionId.split('@')[0]); total += question.maxUnits;
    return { questionVersionId: question.questionVersionId, maxUnits: question.maxUnits };
  });
  if (total > 1_000_000) throw new AssessmentTemplateValidationError();
  return { title: input.title.trim(), instructions: input.instructions.trim(), questions };
}
function reviewed(input: AssessmentTemplateContent, available: readonly string[]) {
  if (!Array.isArray(available) || available.some(value => typeof value !== 'string' || !versionId.test(value))) throw new AssessmentTemplateValidationError();
  const versions = new Set(available);
  if (input.questions.some(question => !versions.has(question.questionVersionId))) throw new AssessmentTemplateValidationError('A selected question is unavailable. Replace it with a reviewed version before continuing.');
}
type Head = QueryResultRow & { id: string; owner_id: string; revision: number; status: AssessmentTemplateStatus; current_version: number; created_at: string | Date; updated_at: string | Date };
type Version = QueryResultRow & { version: number; title: string; instructions: string; questions: AssessmentDraftQuestion[]; max_units: number; created_at: string | Date };
const snapshot = (head: Head, version: Version): StoredAssessmentTemplate => ({ id: head.id, revision: head.revision, status: head.status,
  currentVersion: head.current_version, version: version.version, title: version.title, instructions: version.instructions,
  questions: version.questions, maxUnits: version.max_units, createdAt: iso(head.created_at), updatedAt: iso(head.updated_at), versionCreatedAt: iso(version.created_at) });

/** Private reusable content belongs to its creator, including in administrator scope. */
export class PostgresAssessmentTemplateRepository {
  constructor(private readonly db: DatabaseClient, private readonly principal: AssessmentDraftPrincipal) {}

  private actorId(): string {
    if (!this.principal || !['instructor', 'administrator'].includes(this.principal.role)) throw new AssessmentTemplateAccessError();
    return id(this.principal.userId);
  }
  private async authorize(client: PoolClient): Promise<void> {
    const actorId = this.actorId();
    const actor = (await client.query<{ role: string }>('SELECT role FROM users WHERE id=$1 FOR SHARE', [actorId])).rows[0];
    if (!actor) throw new AssessmentTemplateAccessError();
    if (this.principal.role === 'administrator') {
      const roles = (await client.query<{ role: AdministrationRole }>('SELECT role FROM administration_role_assignments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE', [actorId])).rows;
      if (!canPerformAdministrationAction(roles.map(item => item.role), 'classes.manage')) throw new AssessmentTemplateAccessError();
    } else if (!['instructor', 'admin'].includes(actor.role)) throw new AssessmentTemplateAccessError();
  }
  private async classroom(client: PoolClient, classId: string): Promise<void> {
    const found = await client.query(`SELECT id FROM classrooms WHERE id=$1 AND archived_at IS NULL
      AND ($2::boolean OR created_by=$3) FOR SHARE`, [classId, this.principal.role === 'administrator', this.actorId()]);
    if (!found.rows[0]) throw new AssessmentTemplateAccessError();
  }
  private async head(client: PoolClient, templateId: string, update = false): Promise<Head> {
    const result = await client.query<Head>(`SELECT * FROM assessment_templates WHERE id=$1 AND owner_id=$2 FOR ${update ? 'UPDATE' : 'SHARE'}`, [templateId, this.actorId()]);
    if (!result.rows[0]) throw new AssessmentTemplateAccessError();
    return result.rows[0];
  }
  private async version(client: PoolClient, head: Head, version = head.current_version): Promise<StoredAssessmentTemplate> {
    if (version > head.current_version) throw new AssessmentTemplateAccessError();
    const result = await client.query<Version>('SELECT * FROM assessment_template_versions WHERE template_id=$1 AND version=$2', [head.id, version]);
    if (!result.rows[0]) throw new AssessmentTemplateAccessError();
    return snapshot(head, result.rows[0]);
  }
  private async lock(client: PoolClient, requestKey: string, draft = false) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`assessment-${draft ? 'draft' : 'template'}-request:${this.actorId()}:${requestKey}`]);
  }
  private async previous<T>(client: PoolClient, requestKey: string, digest: string, draft = false): Promise<T | null> {
    const table = draft ? 'assessment_draft_mutations' : 'assessment_template_mutations';
    const previous = (await client.query<{ fingerprint: string; snapshot: T }>(`SELECT fingerprint,snapshot FROM ${table} WHERE actor_id=$1 AND request_key=$2`, [this.actorId(), requestKey])).rows[0];
    if (!previous) return null;
    if (previous.fingerprint !== digest) throw new AssessmentTemplateConflictError();
    return previous.snapshot;
  }
  private async audit(client: PoolClient, input: Required<Command>, action: string, targetId: string, metadata: Record<string, unknown>, draft = false) {
    await client.query(`INSERT INTO administration_audit_events(actor_id,action,target_type,target_id,reason,request_id,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [this.actorId(), action, draft ? 'assessment_draft' : 'assessment_template', targetId, input.reason, input.requestId, metadata]);
  }
  private async record(client: PoolClient, saved: StoredAssessmentTemplate, input: Required<Command>, digest: string, action: string, extra: Record<string, unknown> = {}) {
    await client.query('INSERT INTO assessment_template_mutations(actor_id,request_key,template_id,fingerprint,snapshot) VALUES($1,$2,$3,$4,$5)', [this.actorId(), input.requestKey, saved.id, digest, saved]);
    await this.audit(client, input, action, saved.id, { revision: saved.revision, version: saved.version, questionCount: saved.questions.length, maxUnits: saved.maxUnits, ...extra });
  }

  async listTemplates(input: { search: string; status: AssessmentTemplateStatus | 'all'; page: number }): Promise<{ items: AssessmentTemplateSummary[]; total: number }> {
    fields(input, ['search', 'status', 'page']);
    if (Object.keys(input).length !== 3 || typeof input.search !== 'string' || input.search.length > 160 || !['active', 'archived', 'all'].includes(input.status)
      || !Number.isSafeInteger(input.page) || input.page < 1 || input.page > 1_000_000) throw new AssessmentTemplateValidationError();
    return this.db.transaction(async client => {
      await this.authorize(client);
      const row = (await client.query<{ total: number; items: AssessmentTemplateSummary[] }>(`WITH matches AS MATERIALIZED(
        SELECT t.id,t.revision,t.status,t.current_version,v.title,jsonb_array_length(v.questions) AS question_count,v.max_units,t.updated_at
        FROM assessment_templates t JOIN assessment_template_versions v ON v.template_id=t.id AND v.version=t.current_version
        WHERE t.owner_id=$1 AND ($2='all' OR t.status=$2) AND strpos(lower(v.title||' '||v.instructions),lower($3))>0
      ), page AS(SELECT * FROM matches ORDER BY updated_at DESC,id LIMIT 20 OFFSET $4)
      SELECT (SELECT count(*)::integer FROM matches) AS total,COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',id,'revision',revision,'status',status,'currentVersion',current_version,'title',title,'questionCount',question_count,'maxUnits',max_units,
        'updatedAt',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY updated_at DESC,id) FROM page),'[]'::jsonb) AS items`,
      [this.actorId(), input.status, input.search.trim(), (input.page - 1) * 20])).rows[0];
      return { items: row.items, total: row.total };
    });
  }

  async getTemplate(templateId: string, version?: number): Promise<StoredAssessmentTemplate> {
    const template = id(templateId); if (version !== undefined) positive(version);
    return this.db.transaction(async client => { await this.authorize(client); return this.version(client, await this.head(client, template), version); });
  }

  async createFromDraft(input: AssessmentTemplateCreateInput, availableQuestionVersionIds: readonly string[]): Promise<StoredAssessmentTemplate> {
    const normalized = command(input, ['sourceDraftId', 'sourceClassId', 'expectedRevision']);
    const sourceDraftId = id(input.sourceDraftId), sourceClassId = id(input.sourceClassId); positive(input.expectedRevision);
    const digest = fingerprint({ operation: 'create_from_draft', sourceDraftId, sourceClassId, expectedRevision: input.expectedRevision, reason: normalized.reason });
    return this.db.transaction(async client => {
      await this.lock(client, normalized.requestKey); await this.authorize(client); await this.classroom(client, sourceClassId);
      const source = (await client.query<{ revision: number; title: string; instructions: string; questions: AssessmentDraftQuestion[] }>('SELECT revision,title,instructions,questions FROM assessment_drafts WHERE id=$1 AND class_id=$2 FOR SHARE', [sourceDraftId, sourceClassId])).rows[0];
      if (!source) throw new AssessmentTemplateAccessError();
      const previous = await this.previous<StoredAssessmentTemplate>(client, normalized.requestKey, digest);
      if (previous) { await this.head(client, previous.id); return previous; }
      if (source.revision !== input.expectedRevision) throw new AssessmentTemplateConflictError(source.revision);
      const body = content({ title: source.title, instructions: source.instructions, questions: source.questions }); reviewed(body, availableQuestionVersionIds);
      const created = (await client.query<Head>('INSERT INTO assessment_templates(owner_id) VALUES($1) RETURNING *', [this.actorId()])).rows[0];
      await client.query('INSERT INTO assessment_template_versions(template_id,version,title,instructions,questions) VALUES($1,1,$2,$3,$4::jsonb)', [created.id, body.title, body.instructions, JSON.stringify(body.questions)]);
      const saved = await this.version(client, created);
      await this.record(client, saved, normalized, digest, 'assessments.template.create', { sourceDraftId, sourceClassId, sourceRevision: source.revision });
      return saved;
    });
  }

  async updateTemplate(input: AssessmentTemplateUpdateInput, availableQuestionVersionIds: readonly string[]): Promise<StoredAssessmentTemplate> {
    const normalized = command(input, ['templateId', 'expectedRevision', 'content']); const templateId = id(input.templateId); positive(input.expectedRevision);
    const body = content(input.content);
    const digest = fingerprint({ operation: 'update', templateId, expectedRevision: input.expectedRevision, content: body, reason: normalized.reason });
    return this.db.transaction(async client => {
      await this.lock(client, normalized.requestKey); await this.authorize(client); const current = await this.head(client, templateId, true);
      const previous = await this.previous<StoredAssessmentTemplate>(client, normalized.requestKey, digest); if (previous) return previous;
      if (current.revision !== input.expectedRevision) throw new AssessmentTemplateConflictError(current.revision);
      if (current.status !== 'active') throw new AssessmentTemplateValidationError('Restore the archived template before editing.');
      reviewed(body, availableQuestionVersionIds);
      await client.query('INSERT INTO assessment_template_versions(template_id,version,title,instructions,questions) VALUES($1,$2,$3,$4,$5::jsonb)', [templateId, current.current_version + 1, body.title, body.instructions, JSON.stringify(body.questions)]);
      const updated = (await client.query<Head>('UPDATE assessment_templates SET revision=revision+1,current_version=current_version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *', [templateId])).rows[0];
      const saved = await this.version(client, updated); await this.record(client, saved, normalized, digest, 'assessments.template.update'); return saved;
    });
  }

  async setArchived(input: AssessmentTemplateArchiveInput): Promise<StoredAssessmentTemplate> {
    const normalized = command(input, ['templateId', 'expectedRevision', 'archived']); const templateId = id(input.templateId); positive(input.expectedRevision);
    if (typeof input.archived !== 'boolean') throw new AssessmentTemplateValidationError();
    const digest = fingerprint({ operation: 'set_archived', templateId, expectedRevision: input.expectedRevision, archived: input.archived, reason: normalized.reason });
    return this.db.transaction(async client => {
      await this.lock(client, normalized.requestKey); await this.authorize(client); const current = await this.head(client, templateId, true);
      const previous = await this.previous<StoredAssessmentTemplate>(client, normalized.requestKey, digest); if (previous) return previous;
      if (current.revision !== input.expectedRevision) throw new AssessmentTemplateConflictError(current.revision);
      const updated = (await client.query<Head>('UPDATE assessment_templates SET revision=revision+1,status=$2,updated_at=clock_timestamp() WHERE id=$1 RETURNING *', [templateId, input.archived ? 'archived' : 'active'])).rows[0];
      const saved = await this.version(client, updated); await this.record(client, saved, normalized, digest, input.archived ? 'assessments.template.archive' : 'assessments.template.restore'); return saved;
    });
  }

  async createDraft(input: AssessmentTemplateUseInput, availableQuestionVersionIds: readonly string[]): Promise<StoredAssessmentDraft> {
    const normalized = command(input, ['templateId', 'version', 'expectedRevision', 'destinationClassId']);
    const templateId = id(input.templateId), destinationClassId = id(input.destinationClassId); positive(input.version); positive(input.expectedRevision);
    const digest = fingerprint({ operation: 'template_use', templateId, version: input.version, expectedRevision: input.expectedRevision, destinationClassId, reason: normalized.reason });
    return this.db.transaction(async client => {
      await this.lock(client, normalized.requestKey, true); await this.authorize(client); await this.classroom(client, destinationClassId);
      const current = await this.head(client, templateId);
      const previous = await this.previous<StoredAssessmentDraft>(client, normalized.requestKey, digest, true); if (previous) return previous;
      if (current.revision !== input.expectedRevision) throw new AssessmentTemplateConflictError(current.revision);
      if (current.status !== 'active') throw new AssessmentTemplateValidationError('Restore the archived template before creating new drafts.');
      const selected = await this.version(client, current, input.version);
      const body = content({ title: selected.title, instructions: selected.instructions, questions: selected.questions }); reviewed(body, availableQuestionVersionIds);
      const row = (await client.query<QueryResultRow & { id: string; revision: number; created_at: string | Date; updated_at: string | Date }>(`INSERT INTO assessment_drafts(class_id,title,instructions,questions,created_by)
        VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id,revision,created_at,updated_at`, [destinationClassId, body.title, body.instructions, JSON.stringify(body.questions), this.actorId()])).rows[0];
      const saved: StoredAssessmentDraft = { ...body, id: row.id, classId: destinationClassId, revision: row.revision, status: 'draft',
        maxUnits: body.questions.reduce((sum, question) => sum + question.maxUnits, 0), createdBy: this.actorId(),
        availableAt: null, dueAt: null, closesAt: null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
      await client.query('INSERT INTO assessment_draft_mutations(actor_id,request_key,draft_id,fingerprint,snapshot) VALUES($1,$2,$3,$4,$5)', [this.actorId(), normalized.requestKey, saved.id, digest, saved]);
      await this.audit(client, normalized, 'assessments.template.use', saved.id, { templateId, version: selected.version, classId: destinationClassId, revision: saved.revision, questionCount: saved.questions.length, maxUnits: saved.maxUnits }, true);
      return saved;
    });
  }
}

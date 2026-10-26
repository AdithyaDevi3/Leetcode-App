import { createHash } from 'node:crypto';
import { canPerformAdministrationAction, type AdministrationRole } from '@leetcode-app/domain';
import type { PoolClient, QueryResultRow } from 'pg';
import type { DatabaseClient } from '../client.js';

export type AssessmentDraftPrincipal = { role: 'instructor' | 'administrator'; userId: string };
export type AssessmentDraftQuestion = { questionVersionId: string; maxUnits: number };
export type AssessmentDraftInput = {
  classId: string; title: string; instructions: string; questions: readonly AssessmentDraftQuestion[];
  availableAt: string | null; dueAt: string | null; closesAt: string | null;
};
export type StoredAssessmentDraft = AssessmentDraftInput & {
  id: string; revision: number; status: 'draft'; maxUnits: number; createdBy: string | null; createdAt: string; updatedAt: string;
};
type DraftMutation = { draft: AssessmentDraftInput; requestKey: string; reason: string; requestId?: string | null };

export class AssessmentDraftAccessError extends Error {
  constructor() { super('Assessment draft or class not found.'); this.name = 'AssessmentDraftAccessError'; }
}
export class AssessmentDraftConflictError extends Error {
  constructor(public readonly currentRevision?: number) {
    super('This draft changed or the save key was already used. Reload the saved version before trying again.');
    this.name = 'AssessmentDraftConflictError';
  }
}
export class AssessmentDraftValidationError extends Error {
  constructor(message = 'The assessment draft is invalid.') { super(message); this.name = 'AssessmentDraftValidationError'; }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const versionId = /^[a-z][a-z0-9-]{2,79}@[1-9][0-9]{0,5}$/;
const iso = (value: string | Date) => new Date(value).toISOString();

function timestamp(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new AssessmentDraftValidationError('Choose a valid date and time.');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new AssessmentDraftValidationError('Dates must include a time zone.');
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) {
    throw new AssessmentDraftValidationError('Choose a valid date and time.');
  }
  return iso(value);
}

function validatedDraft(input: AssessmentDraftInput): AssessmentDraftInput {
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['classId', 'title', 'instructions', 'questions', 'availableAt', 'dueAt', 'closesAt'].includes(key))) throw new AssessmentDraftValidationError();
  if (typeof input.classId !== 'string' || !uuid.test(input.classId)) throw new AssessmentDraftValidationError('Choose a valid class.');
  if (typeof input.title !== 'string' || input.title.trim().length < 3 || input.title.trim().length > 160) throw new AssessmentDraftValidationError('Title must be 3–160 characters.');
  if (typeof input.instructions !== 'string' || input.instructions.length > 2000) throw new AssessmentDraftValidationError('Instructions must be at most 2,000 characters.');
  if (!Array.isArray(input.questions) || input.questions.length < 1 || input.questions.length > 30) throw new AssessmentDraftValidationError('Choose 1–30 questions.');
  const seen = new Set<string>();
  let total = 0;
  const questions = input.questions.map(question => {
    if (!question || typeof question !== 'object' || Object.keys(question).length !== 2 || !Object.hasOwn(question, 'questionVersionId') || !Object.hasOwn(question, 'maxUnits')
      || typeof question.questionVersionId !== 'string' || !versionId.test(question.questionVersionId)
      || seen.has(question.questionVersionId) || !Number.isSafeInteger(question.maxUnits) || question.maxUnits < 1 || question.maxUnits > 1_000_000) {
      throw new AssessmentDraftValidationError('Each question needs a unique version and positive points.');
    }
    seen.add(question.questionVersionId);
    total += question.maxUnits;
    return { questionVersionId: question.questionVersionId, maxUnits: question.maxUnits };
  });
  if (total > 1_000_000) throw new AssessmentDraftValidationError('Assessment points exceed the supported total.');
  const availableAt = timestamp(input.availableAt), dueAt = timestamp(input.dueAt), closesAt = timestamp(input.closesAt);
  if ((availableAt && dueAt && availableAt > dueAt) || (dueAt && closesAt && dueAt > closesAt) || (availableAt && closesAt && availableAt > closesAt)) {
    throw new AssessmentDraftValidationError('Availability, due date, and closing date must be in order.');
  }
  return { classId: input.classId, title: input.title.trim(), instructions: input.instructions.trim(), questions, availableAt, dueAt, closesAt };
}

type DraftRow = QueryResultRow & {
  id: string; class_id: string; title: string; instructions: string; questions: AssessmentDraftQuestion[];
  available_at: string | Date | null; due_at: string | Date | null; closes_at: string | Date | null;
  revision: number; max_units: number; created_by: string | null; created_at: string | Date; updated_at: string | Date;
};
const mapDraft = (row: DraftRow): StoredAssessmentDraft => ({
  id: row.id, classId: row.class_id, title: row.title, instructions: row.instructions, questions: row.questions,
  availableAt: row.available_at ? iso(row.available_at) : null, dueAt: row.due_at ? iso(row.due_at) : null, closesAt: row.closes_at ? iso(row.closes_at) : null,
  revision: row.revision, status: 'draft', maxUnits: row.max_units, createdBy: row.created_by, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
});

/** Private authoring only; publication and learner access require a separate immutable policy. */
export class PostgresAssessmentDraftRepository {
  constructor(private readonly db: DatabaseClient, private readonly principal: AssessmentDraftPrincipal) {}

  private async authorizeClass(client: PoolClient, classId: string): Promise<void> {
    if (!this.principal || !uuid.test(this.principal.userId) || !['instructor', 'administrator'].includes(this.principal.role) || !uuid.test(classId)) throw new AssessmentDraftAccessError();
    const user = await client.query<{ role: string }>('SELECT role FROM users WHERE id = $1 FOR SHARE', [this.principal.userId]);
    if (!user.rows[0]) throw new AssessmentDraftAccessError();
    if (this.principal.role === 'administrator') {
      const roles = await client.query<{ role: AdministrationRole }>('SELECT role FROM administration_role_assignments WHERE user_id = $1 AND revoked_at IS NULL FOR SHARE', [this.principal.userId]);
      if (!canPerformAdministrationAction(roles.rows.map(row => row.role), 'classes.manage')) throw new AssessmentDraftAccessError();
    } else if (!['instructor', 'admin'].includes(user.rows[0].role)) throw new AssessmentDraftAccessError();
    const classroom = await client.query(`SELECT id FROM classrooms WHERE id = $1 AND archived_at IS NULL
      AND ($2::boolean OR created_by = $3) FOR SHARE`, [classId, this.principal.role === 'administrator', this.principal.userId]);
    if (!classroom.rows[0]) throw new AssessmentDraftAccessError();
  }

  private mutation(input: DraftMutation): { draft: AssessmentDraftInput; requestKey: string; reason: string; requestId: string | null } {
    if (!input || typeof input !== 'object') throw new AssessmentDraftValidationError();
    if (typeof input.requestKey !== 'string' || input.requestKey.trim().length < 1 || input.requestKey.length > 128) throw new AssessmentDraftValidationError('A valid save key is required.');
    if (typeof input.reason !== 'string' || input.reason.trim().length < 8 || input.reason.trim().length > 500) throw new AssessmentDraftValidationError('Give an authoring reason of 8–500 characters.');
    if (input.requestId !== undefined && input.requestId !== null && (typeof input.requestId !== 'string' || input.requestId.length > 100)) throw new AssessmentDraftValidationError('Invalid request identifier.');
    return { draft: validatedDraft(input.draft), requestKey: input.requestKey.trim(), reason: input.reason.trim(), requestId: input.requestId ?? null };
  }

  private async previous(client: PoolClient, requestKey: string, fingerprint: string): Promise<StoredAssessmentDraft | null> {
    const result = await client.query<{ fingerprint: string; snapshot: StoredAssessmentDraft }>(
      'SELECT fingerprint, snapshot FROM assessment_draft_mutations WHERE actor_id = $1 AND request_key = $2', [this.principal.userId, requestKey]);
    if (!result.rows[0]) return null;
    if (result.rows[0].fingerprint !== fingerprint) throw new AssessmentDraftConflictError();
    return result.rows[0].snapshot;
  }

  private async record(client: PoolClient, saved: StoredAssessmentDraft, input: ReturnType<PostgresAssessmentDraftRepository['mutation']>, fingerprint: string, action: string): Promise<void> {
    await client.query('INSERT INTO assessment_draft_mutations (actor_id, request_key, draft_id, fingerprint, snapshot) VALUES ($1,$2,$3,$4,$5)',
      [this.principal.userId, input.requestKey, saved.id, fingerprint, saved]);
    await client.query(`INSERT INTO administration_audit_events (actor_id, action, target_type, target_id, reason, request_id, metadata)
      VALUES ($1,$2,'assessment_draft',$3,$4,$5,$6)`, [this.principal.userId, action, saved.id, input.reason, input.requestId,
      { classId: saved.classId, revision: saved.revision, questionCount: saved.questions.length, maxUnits: saved.maxUnits }]);
  }

  async createDraft(input: DraftMutation): Promise<StoredAssessmentDraft> {
    const normalized = this.mutation(input);
    const fingerprint = createHash('sha256').update(JSON.stringify({ operation: 'create', draft: normalized.draft, reason: normalized.reason })).digest('hex');
    return this.db.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`assessment-draft-request:${this.principal.userId}:${normalized.requestKey}`]);
      await this.authorizeClass(client, normalized.draft.classId);
      const previous = await this.previous(client, normalized.requestKey, fingerprint);
      if (previous) return previous;
      const draft = normalized.draft;
      const result = await client.query<DraftRow>(`INSERT INTO assessment_drafts (class_id,title,instructions,questions,available_at,due_at,closes_at,created_by)
        VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING *`,
      [draft.classId, draft.title, draft.instructions, JSON.stringify(draft.questions), draft.availableAt, draft.dueAt, draft.closesAt, this.principal.userId]);
      const saved = mapDraft(result.rows[0]);
      await this.record(client, saved, normalized, fingerprint, 'assessments.draft.create');
      return saved;
    });
  }

  async updateDraft(input: DraftMutation & { draftId: string; expectedRevision: number }): Promise<StoredAssessmentDraft> {
    const normalized = this.mutation(input);
    if (!uuid.test(input.draftId)) throw new AssessmentDraftAccessError();
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new AssessmentDraftValidationError('A valid draft revision is required.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ operation: 'update', draftId: input.draftId, expectedRevision: input.expectedRevision, draft: normalized.draft, reason: normalized.reason })).digest('hex');
    return this.db.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`assessment-draft-request:${this.principal.userId}:${normalized.requestKey}`]);
      const identity = await client.query<{ class_id: string }>('SELECT class_id FROM assessment_drafts WHERE id=$1', [input.draftId]);
      if (!identity.rows[0]) throw new AssessmentDraftAccessError();
      await this.authorizeClass(client, identity.rows[0].class_id);
      const current = await client.query<DraftRow>('SELECT * FROM assessment_drafts WHERE id=$1 AND class_id=$2 FOR UPDATE', [input.draftId, identity.rows[0].class_id]);
      if (!current.rows[0]) throw new AssessmentDraftAccessError();
      if (normalized.draft.classId !== current.rows[0].class_id) throw new AssessmentDraftValidationError('A saved draft cannot move to another class.');
      const previous = await this.previous(client, normalized.requestKey, fingerprint);
      if (previous) return previous;
      if (current.rows[0].revision !== input.expectedRevision) throw new AssessmentDraftConflictError(current.rows[0].revision);
      const draft = normalized.draft;
      const result = await client.query<DraftRow>(`UPDATE assessment_drafts SET title=$2,instructions=$3,questions=$4::jsonb,
        available_at=$5,due_at=$6,closes_at=$7,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
      [input.draftId, draft.title, draft.instructions, JSON.stringify(draft.questions), draft.availableAt, draft.dueAt, draft.closesAt]);
      const saved = mapDraft(result.rows[0]);
      await this.record(client, saved, normalized, fingerprint, 'assessments.draft.update');
      return saved;
    });
  }

  async getDraft(draftId: string): Promise<StoredAssessmentDraft> {
    if (!uuid.test(draftId)) throw new AssessmentDraftAccessError();
    return this.db.transaction(async client => {
      const identity = await client.query<{ class_id: string }>('SELECT class_id FROM assessment_drafts WHERE id=$1', [draftId]);
      if (!identity.rows[0]) throw new AssessmentDraftAccessError();
      await this.authorizeClass(client, identity.rows[0].class_id);
      const result = await client.query<DraftRow>('SELECT * FROM assessment_drafts WHERE id=$1 AND class_id=$2 FOR SHARE', [draftId, identity.rows[0].class_id]);
      if (!result.rows[0]) throw new AssessmentDraftAccessError();
      return mapDraft(result.rows[0]);
    });
  }

  async listDrafts(classId: string): Promise<StoredAssessmentDraft[]> {
    return this.db.transaction(async client => {
      await this.authorizeClass(client, classId);
      const result = await client.query<DraftRow>('SELECT * FROM assessment_drafts WHERE class_id=$1 ORDER BY updated_at DESC, id LIMIT 100', [classId]);
      return result.rows.map(mapDraft);
    });
  }
}

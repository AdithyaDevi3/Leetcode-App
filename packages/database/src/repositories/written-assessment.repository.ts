import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { canPerformAdministrationAction, freezeAssignmentGradePolicy, type AdministrationRole, type GradeCriterion } from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';
export type WrittenAssessmentDraftInput = {
    classId: string;
    title: string;
    instructions: string;
    prompt: string;
    criteria: readonly GradeCriterion[];
    availableAt: string | null;
    dueAt: string | null;
    closesAt: string | null;
};
export type WrittenAssessmentDraft = WrittenAssessmentDraftInput & {
    id: string;
    createdBy: string | null;
    revision: number;
    status: 'draft';
    maxUnits: number;
    createdAt: string;
    updatedAt: string;
};
export type WrittenPublication = {
    id: string;
    draftId: string;
    draftRevision: number;
    classId: string;
    assignmentId: string;
    policyVersionId: string;
    recipientCount: number;
    audienceKind: 'class' | 'selected';
    publishedAt: string;
};
export type WrittenAuthorView = {
    draft: WrittenAssessmentDraft;
    learners: {
        id: string;
        displayName: string;
        email: string | null;
    }[];
    rosterFingerprint: string;
    publication: WrittenPublication | null;
};
export type WrittenResponseDraft = {
    revision: number;
    text: string;
    updatedAt: string | null;
};
export type WrittenResponseSave = {
    responseDraft: WrittenResponseDraft;
    currentRevision: number;
};
export type WrittenSubmissionReceipt = {
    attemptId: string;
    responseRevisionId: string;
    responseRevision: number;
    submittedAt: string;
    isLate: boolean;
};
export type LearnerWrittenAssignment = {
    recipientId: string;
    classId: string;
    assignmentId: string;
    policyVersionId: string;
    title: string;
    instructions: string;
    prompt: string;
    criteria: readonly GradeCriterion[];
    maxUnits: number;
    availableAt: string | null;
    dueAt: string | null;
    closesAt: string | null;
    responseDraft: WrittenResponseDraft;
    submission: WrittenSubmissionReceipt | null;
    releasedGrade: {
        gradeRevisionId: string;
        earnedUnits: number;
        criterionScores: Record<string, number>;
        learnerFeedback: string;
        publishedAt: string;
    } | null;
    isOpen: boolean;
    isClosed: boolean;
    isExcused: boolean;
};
export type WrittenAssessmentPrincipal = {
    role: 'learner' | 'instructor' | 'administrator';
    userId: string;
};
export class WrittenAssessmentAccessError extends Error {
    constructor() { super('Written assessment is not available.'); this.name = 'WrittenAssessmentAccessError'; }
}
export class WrittenAssessmentValidationError extends Error {
    constructor(message = 'Invalid written assessment request.') { super(message); this.name = 'WrittenAssessmentValidationError'; }
}
export class WrittenAssessmentConflictError extends Error {
    constructor(public readonly currentRevision?: number, public readonly code: 'revision_changed' | 'already_published' | 'roster_changed' | 'submitted' = 'revision_changed') { super('This written assessment changed. Refresh and compare your saved work.'); this.name = 'WrittenAssessmentConflictError'; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso = (v: string | Date) => new Date(v).toISOString();
const date = (v: string | Date | null) => v === null ? null : iso(v);
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const id = (v: string) => { if (typeof v !== 'string' || !uuid.test(v))
    throw new WrittenAssessmentAccessError(); return v.toLowerCase(); };
const key = (v: string) => { if (typeof v !== 'string' || !v.trim() || v.length > 128 || v.includes('\0') || /[\uD800-\uDFFF]/u.test(v))
    throw new WrittenAssessmentValidationError(); return v; };
const rev = (v: number) => { if (!Number.isSafeInteger(v) || v < 0 || v > 2147483646)
    throw new WrittenAssessmentValidationError(); return v; };
const text = (v: string, max: number, min = 0) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max || v.includes('\0') || /[\uD800-\uDFFF]/u.test(v))
    throw new WrittenAssessmentValidationError(); return v; };
function timestamp(v: string | null): string | null { if (v === null)
    return null; if (typeof v !== 'string' || v.startsWith('0000-') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v) || !Number.isFinite(Date.parse(v)) || ![iso(v), iso(v).replace('.000Z', 'Z')].includes(v))
    throw new WrittenAssessmentValidationError(); return iso(v); }
function validated(input: WrittenAssessmentDraftInput): WrittenAssessmentDraftInput {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['classId', 'title', 'instructions', 'prompt', 'criteria', 'availableAt', 'dueAt', 'closesAt'].includes(k)))
        throw new WrittenAssessmentValidationError();
    id(input.classId);
    text(input.title, 160, 3);
    text(input.instructions, 2000);
    text(input.prompt, 20000, 1);
    if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 20)
        throw new WrittenAssessmentValidationError();
    const seen = new Set<string>();
    let total = 0;
    const criteria = input.criteria.map(c => { if (!c || typeof c !== 'object' || Object.keys(c).length !== 3 || !Object.hasOwn(c, 'id') || !Object.hasOwn(c, 'label') || !Object.hasOwn(c, 'maxUnits') || typeof c.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(c.id) || ['constructor', 'prototype', '__proto__'].includes(c.id) || seen.has(c.id) || !Number.isSafeInteger(c.maxUnits) || c.maxUnits < 1 || c.maxUnits > 1000000)
        throw new WrittenAssessmentValidationError(); text(c.label, 160, 1); seen.add(c.id); total += c.maxUnits; return { id: c.id, label: c.label.trim(), maxUnits: c.maxUnits }; });
    if (total > 1000000)
        throw new WrittenAssessmentValidationError();
    const availableAt = timestamp(input.availableAt), dueAt = timestamp(input.dueAt), closesAt = timestamp(input.closesAt);
    const dates = [availableAt, dueAt, closesAt].filter((v): v is string => v !== null);
    if (dates.some((v, i) => i > 0 && dates[i - 1] > v))
        throw new WrittenAssessmentValidationError();
    return { classId: input.classId.toLowerCase(), title: input.title.trim(), instructions: input.instructions.trim(), prompt: input.prompt.trim(), criteria, availableAt, dueAt, closesAt };
}
type DraftRow = {
    id: string;
    class_id: string;
    title: string;
    instructions: string;
    prompt: string;
    criteria: GradeCriterion[];
    max_units: number;
    available_at: Date | null;
    due_at: Date | null;
    closes_at: Date | null;
    revision: number;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
};
type PubRow = {
    id: string;
    draft_id: string;
    draft_revision: number;
    class_id: string;
    assignment_id: string;
    policy_id: string;
    title: string;
    instructions: string;
    prompt: string;
    criteria: GradeCriterion[];
    max_units: number;
    available_at: Date | null;
    due_at: Date | null;
    closes_at: Date | null;
    audience_kind: 'class' | 'selected';
    audience_learner_ids: string[];
    created_at: Date;
};
type RecipientRow = PubRow & {
    recipient_id: string;
    applicability: 'assigned' | 'excused';
};
type AttemptRow = {
    id: string;
    response_revision_id: string;
    submitted_at: Date;
};
const draft = (r: DraftRow): WrittenAssessmentDraft => ({ id: r.id, classId: r.class_id, title: r.title, instructions: r.instructions, prompt: r.prompt, criteria: r.criteria, maxUnits: r.max_units, availableAt: date(r.available_at), dueAt: date(r.due_at), closesAt: date(r.closes_at), revision: r.revision, status: 'draft', createdBy: r.created_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const publication = (r: PubRow): WrittenPublication => ({ id: r.id, draftId: r.draft_id, draftRevision: r.draft_revision, classId: r.class_id, assignmentId: r.assignment_id, policyVersionId: r.policy_id, recipientCount: r.audience_learner_ids.length, audienceKind: r.audience_kind, publishedAt: iso(r.created_at) });
/** Private typed boundary; immutable attempts/grades/releases remain in the existing gradebook. */
export class PostgresWrittenAssessmentRepository {
    private readonly principal: WrittenAssessmentPrincipal;
    constructor(private readonly db: DatabaseClient, principal: WrittenAssessmentPrincipal) { if (!principal || !['learner', 'instructor', 'administrator'].includes(principal.role))
        throw new WrittenAssessmentAccessError(); this.principal = Object.freeze({ role: principal.role, userId: id(principal.userId) }); }
    private async authorize(client: PoolClient, classId: string, mode: 'author' | 'learner') {
        id(classId);
        if (mode === 'learner' ? this.principal.role !== 'learner' : this.principal.role === 'learner')
            throw new WrittenAssessmentAccessError();
        const u = await client.query<{
            role: string;
        }>('SELECT role FROM users WHERE id=$1 FOR SHARE', [this.principal.userId]);
        if (!u.rows[0])
            throw new WrittenAssessmentAccessError();
        if (this.principal.role === 'administrator') {
            const roles = await client.query<{
                role: AdministrationRole;
            }>('SELECT role FROM administration_role_assignments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE', [this.principal.userId]);
            if (!canPerformAdministrationAction(roles.rows.map(r => r.role), 'classes.manage'))
                throw new WrittenAssessmentAccessError();
        }
        else if (this.principal.role === 'learner' ? u.rows[0].role !== 'learner' : !['instructor', 'admin'].includes(u.rows[0].role))
            throw new WrittenAssessmentAccessError();
        const c = await client.query('SELECT id FROM classrooms WHERE id=$1 AND archived_at IS NULL AND ($2::boolean OR created_by=$3) FOR SHARE', [classId, mode === 'learner' || this.principal.role === 'administrator', this.principal.userId]);
        if (!c.rows[0])
            throw new WrittenAssessmentAccessError();
    }
    private async lock(client: PoolClient, requestKey: string) { key(requestKey); await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`written-request:${this.principal.userId}:${requestKey}`]); }
    private async prior<T>(client: PoolClient, requestKey: string, fingerprint: string): Promise<T | null> { const r = await client.query<{
        fingerprint: string;
        response: T;
    }>('SELECT fingerprint,response FROM written_request_receipts WHERE actor_id=$1 AND request_key=$2', [this.principal.userId, requestKey]); if (!r.rows[0])
        return null; if (r.rows[0].fingerprint !== fingerprint)
        throw new WrittenAssessmentConflictError(); return r.rows[0].response; }
    private async record(client: PoolClient, draftId: string, publicationId: string | null, recipientId: string | null, operation: string, requestKey: string, fingerprint: string, response: unknown) { await client.query('INSERT INTO written_request_receipts(actor_id,request_key,draft_id,publication_id,recipient_id,operation,fingerprint,response) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [this.principal.userId, requestKey, draftId, publicationId, recipientId, operation, fingerprint, JSON.stringify(response)]); }
    private async audit(client: PoolClient, action: string, targetId: string, reason: string, metadata: unknown) { text(reason, 500, 8); await client.query("INSERT INTO administration_audit_events(actor_id,action,target_type,target_id,reason,metadata) VALUES($1,$2,'written_assessment',$3,$4,$5)", [this.principal.userId, action, targetId, reason, metadata]); }
    private async saved(client: PoolClient, draftId: string, classId: string, lock = false) { const r = await client.query<DraftRow>(`SELECT * FROM written_assessment_drafts WHERE id=$1 AND class_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [draftId, classId]); if (!r.rows[0])
        throw new WrittenAssessmentAccessError(); return draft(r.rows[0]); }
    async listDrafts(classId: string): Promise<WrittenAssessmentDraft[]> { id(classId); return this.db.transaction(async (c) => { await this.authorize(c, classId, 'author'); return (await c.query<DraftRow>('SELECT * FROM written_assessment_drafts WHERE class_id=$1 ORDER BY updated_at DESC,id', [classId])).rows.map(draft); }); }
    async getDraft(draftId: string, classId: string): Promise<WrittenAssessmentDraft> { id(draftId); id(classId); return this.db.transaction(async (c) => { await this.authorize(c, classId, 'author'); return this.saved(c, draftId, classId); }); }
    async saveDraft(input: {
        draftId: string | null;
        expectedRevision: number | null;
        draft: WrittenAssessmentDraftInput;
        requestKey: string;
        reason: string;
    }): Promise<WrittenAssessmentDraft> {
        const content = validated(input.draft);
        key(input.requestKey);
        text(input.reason, 500, 8);
        if (input.draftId === null ? input.expectedRevision !== null : (!uuid.test(input.draftId) || input.expectedRevision === null || rev(input.expectedRevision) < 1))
            throw new WrittenAssessmentValidationError();
        const fingerprint = hash({ operation: 'save_draft', draftId: input.draftId?.toLowerCase() ?? null, expectedRevision: input.expectedRevision, draft: content, reason: input.reason });
        return this.db.transaction(async (c) => {
            await this.lock(c, input.requestKey);
            await this.authorize(c, content.classId, 'author');
            const prior = await this.prior<WrittenAssessmentDraft>(c, input.requestKey, fingerprint);
            if (prior) {
                await this.saved(c, prior.id, content.classId);
                return prior;
            }
            const values = [content.classId, content.title, content.instructions, content.prompt, JSON.stringify(content.criteria), content.availableAt, content.dueAt, content.closesAt];
            let r;
            if (input.draftId === null) {
                r = await c.query<DraftRow>('INSERT INTO written_assessment_drafts(class_id,title,instructions,prompt,criteria,available_at,due_at,closes_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [...values, this.principal.userId]);
            }
            else {
                const current = await this.saved(c, input.draftId, content.classId, true);
                if (current.revision !== input.expectedRevision)
                    throw new WrittenAssessmentConflictError(current.revision);
                r = await c.query<DraftRow>('UPDATE written_assessment_drafts SET title=$2,instructions=$3,prompt=$4,criteria=$5,available_at=$6,due_at=$7,closes_at=$8,revision=revision+1,updated_at=clock_timestamp() WHERE class_id=$1 AND id=$9 RETURNING *', [...values, input.draftId]);
            }
            const accepted = draft(r.rows[0]);
            await this.record(c, accepted.id, null, null, 'save_draft', input.requestKey, fingerprint, accepted);
            await this.audit(c, 'assessments.written.save', accepted.id, input.reason, { classId: accepted.classId, revision: accepted.revision, criterionCount: accepted.criteria.length, maxUnits: accepted.maxUnits });
            return accepted;
        });
    }
    private async roster(c: PoolClient, classId: string, lock = false) { return (await c.query<WrittenAuthorView['learners'][number]>(`SELECT u.id,u.display_name AS "displayName",u.email FROM class_enrollments e JOIN users u ON u.id=e.user_id WHERE e.class_id=$1 ORDER BY u.id ${lock ? 'FOR SHARE OF e,u' : ''}`, [classId])).rows; }
    async readAuthorDraft(draftId: string): Promise<WrittenAuthorView> { id(draftId); return this.db.transaction(async (c) => { const identity = await c.query<{
        class_id: string;
    }>('SELECT class_id FROM written_assessment_drafts WHERE id=$1', [draftId]); if (!identity.rows[0])
        throw new WrittenAssessmentAccessError(); await this.authorize(c, identity.rows[0].class_id, 'author'); const saved = await this.saved(c, draftId, identity.rows[0].class_id); const learners = await this.roster(c, saved.classId); const p = await c.query<PubRow>('SELECT * FROM written_assessment_publications WHERE draft_id=$1', [draftId]); return { draft: saved, learners, rosterFingerprint: hash(learners.map(p => p.id)), publication: p.rows[0] ? publication(p.rows[0]) : null }; }); }
    async publishDraft(input: {
        draftId: string;
        expectedRevision: number;
        expectedRosterFingerprint: string;
        audience: {
            kind: 'class' | 'selected';
            learnerIds: readonly string[];
        };
        requestKey: string;
        reason: string;
    }): Promise<WrittenPublication> {
        id(input.draftId);
        rev(input.expectedRevision);
        key(input.requestKey);
        text(input.reason, 500, 8);
        if (input.expectedRevision < 1 || typeof input.expectedRosterFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedRosterFingerprint) || !input.audience || !['class', 'selected'].includes(input.audience.kind) || !Array.isArray(input.audience.learnerIds) || !input.audience.learnerIds.length || input.audience.learnerIds.length > 5000)
            throw new WrittenAssessmentValidationError();
        const learners = input.audience.learnerIds.map(id).sort();
        if (new Set(learners).size !== learners.length)
            throw new WrittenAssessmentValidationError();
        const fingerprint = hash({ operation: 'publish', draftId: input.draftId.toLowerCase(), expectedRevision: input.expectedRevision, expectedRosterFingerprint: input.expectedRosterFingerprint, audience: { kind: input.audience.kind, learnerIds: learners }, reason: input.reason });
        return this.db.transaction(async (c) => {
            await this.lock(c, input.requestKey);
            const identity = await c.query<{
                class_id: string;
                created_by: string | null;
            }>('SELECT class_id,created_by FROM written_assessment_drafts WHERE id=$1', [input.draftId]);
            if (!identity.rows[0])
                throw new WrittenAssessmentAccessError();
            await this.authorize(c, identity.rows[0].class_id, 'author');
            await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [identity.rows[0].class_id]);
            await c.query('SELECT u.id FROM users u WHERE u.id=$2 OR EXISTS(SELECT 1 FROM class_enrollments e WHERE e.class_id=$1 AND e.user_id=u.id) ORDER BY u.id FOR SHARE OF u', [identity.rows[0].class_id, identity.rows[0].created_by]);
            const saved = await this.saved(c, input.draftId, identity.rows[0].class_id, true);
            const prior = await this.prior<WrittenPublication>(c, input.requestKey, fingerprint);
            if (prior)
                return prior;
            if ((await c.query('SELECT id FROM written_assessment_publications WHERE draft_id=$1', [saved.id])).rowCount)
                throw new WrittenAssessmentConflictError(saved.revision, 'already_published');
            if (saved.revision !== input.expectedRevision)
                throw new WrittenAssessmentConflictError(saved.revision);
            const roster = await this.roster(c, saved.classId, true), rosterIds = roster.map(p => p.id);
            if (hash(rosterIds) !== input.expectedRosterFingerprint || (input.audience.kind === 'class' && JSON.stringify(learners) !== JSON.stringify(rosterIds)))
                throw new WrittenAssessmentConflictError(saved.revision, 'roster_changed');
            if (learners.some(p => !rosterIds.includes(p)))
                throw new WrittenAssessmentValidationError();
            const contentId = randomUUID(), contentVersionId = randomUUID(), assignmentId = randomUUID(), policyId = randomUUID(), publicationId = randomUUID();
            await c.query("INSERT INTO content_items(id,slug,type,status,difficulty,estimated_minutes,class_private) VALUES($1,$2,'quiz','draft','beginner',15,true)", [contentId, `class-written-${contentId}`]);
            const content = await c.query("INSERT INTO content_versions(id,content_id,version,title,description,markdown_content) VALUES($1,$2,1,'Class assessment','','') RETURNING to_jsonb(content_versions) AS snapshot", [contentVersionId, contentId]);
            await c.query("INSERT INTO class_assignments(id,class_id,content_id,title,instructions,due_on,created_by) VALUES($1,$2,$3,$4,$5,CASE WHEN $6::timestamptz IS NULL THEN NULL ELSE ($6::timestamptz AT TIME ZONE 'UTC')::date END,$7)", [assignmentId, saved.classId, contentId, saved.title, saved.instructions, saved.dueAt, this.principal.userId]);
            const policy = freezeAssignmentGradePolicy({ assignmentId, versionId: policyId, contentVersionId, maxUnits: saved.maxUnits, attemptPolicy: 'latest', scoring: { mode: 'reviewed_rubric', rubricVersionId: publicationId, criteria: saved.criteria } });
            await c.query('INSERT INTO gradebook_policies(id,assignment_id,content_version_id,policy,content_snapshot,closes_at,created_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [policyId, assignmentId, contentVersionId, policy, content.rows[0].snapshot, saved.closesAt, this.principal.userId, input.reason]);
            await c.query('INSERT INTO gradebook_recipients(policy_id,learner_id) SELECT $1,unnest($2::uuid[])', [policyId, learners]);
            const p = await c.query<PubRow>('INSERT INTO written_assessment_publications(id,draft_id,draft_revision,class_id,assignment_id,policy_id,title,instructions,prompt,criteria,available_at,due_at,closes_at,audience_kind,audience_learner_ids,roster_fingerprint,published_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *', [publicationId, saved.id, saved.revision, saved.classId, assignmentId, policyId, saved.title, saved.instructions, saved.prompt, JSON.stringify(saved.criteria), saved.availableAt, saved.dueAt, saved.closesAt, input.audience.kind, learners, input.expectedRosterFingerprint, this.principal.userId]);
            const accepted = publication(p.rows[0]);
            await this.record(c, saved.id, accepted.id, null, 'publish', input.requestKey, fingerprint, accepted);
            await this.audit(c, 'assessments.written.publish', accepted.id, input.reason, { classId: saved.classId, draftId: saved.id, draftRevision: saved.revision, recipientCount: learners.length, audienceKind: input.audience.kind });
            return accepted;
        });
    }
    private async recipient(c: PoolClient, recipientId: string): Promise<RecipientRow> {
        id(recipientId);
        if (this.principal.role !== 'learner')
            throw new WrittenAssessmentAccessError();
        const identity = await c.query<{
            class_id: string;
            learner_id: string;
        }>('SELECT p.class_id,r.learner_id FROM gradebook_recipients r JOIN written_assessment_publications p ON p.policy_id=r.policy_id WHERE r.id=$1', [recipientId]);
        if (!identity.rows[0] || identity.rows[0].learner_id !== this.principal.userId)
            throw new WrittenAssessmentAccessError();
        await this.authorize(c, identity.rows[0].class_id, 'learner');
        if (!(await c.query('SELECT user_id FROM class_enrollments WHERE class_id=$1 AND user_id=$2 FOR SHARE', [identity.rows[0].class_id, this.principal.userId])).rowCount)
            throw new WrittenAssessmentAccessError();
        const r = await c.query<RecipientRow>('SELECT p.*,r.id AS recipient_id,ar.applicability FROM gradebook_recipients r JOIN written_assessment_publications p ON p.policy_id=r.policy_id JOIN LATERAL(SELECT applicability FROM gradebook_applicability_revisions WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) ar ON true WHERE r.id=$1 AND r.learner_id=$2 FOR UPDATE OF r', [recipientId, this.principal.userId]);
        if (!r.rows[0])
            throw new WrittenAssessmentAccessError();
        return r.rows[0];
    }
    private async timing(c: PoolClient, row: PubRow) { return (await c.query<{
        isOpen: boolean;
        isClosed: boolean;
    }>('SELECT ($1::timestamptz IS NULL OR clock_timestamp()>=$1) AS "isOpen",($2::timestamptz IS NOT NULL AND clock_timestamp()>$2) AS "isClosed"', [row.available_at, row.closes_at])).rows[0]; }
    private async response(c: PoolClient, recipientId: string): Promise<WrittenResponseDraft> { const r = await c.query<{
        revision: number;
        text: string;
        updated_at: Date;
    }>('SELECT revision,text,updated_at FROM written_response_drafts WHERE recipient_id=$1', [recipientId]); return r.rows[0] ? { revision: r.rows[0].revision, text: r.rows[0].text, updatedAt: iso(r.rows[0].updated_at) } : { revision: 0, text: '', updatedAt: null }; }
    private receipt(row: PubRow, attempt: AttemptRow, responseRevision: number): WrittenSubmissionReceipt { return { attemptId: attempt.id, responseRevisionId: attempt.response_revision_id, responseRevision, submittedAt: iso(attempt.submitted_at), isLate: row.due_at !== null && attempt.submitted_at > row.due_at }; }
    async readLearnerAssignment(recipientId: string): Promise<LearnerWrittenAssignment> {
        return this.db.transaction(async (c) => {
            const row = await this.recipient(c, recipientId);
            const times = await this.timing(c, row);
            if (row.applicability === 'excused')
                return { recipientId: row.recipient_id, classId: row.class_id, assignmentId: row.assignment_id, policyVersionId: row.policy_id, title: row.title, instructions: row.instructions, prompt: '', criteria: [], maxUnits: row.max_units, availableAt: date(row.available_at), dueAt: date(row.due_at), closesAt: date(row.closes_at), responseDraft: { revision: 0, text: '', updatedAt: null }, submission: null, releasedGrade: null, isExcused: true, ...times };
            const response = await this.response(c, recipientId);
            const attempt = await c.query<AttemptRow>('SELECT id,response_revision_id,submitted_at FROM gradebook_attempts WHERE recipient_id=$1 ORDER BY sequence LIMIT 1', [recipientId]);
            const released = await c.query('SELECT p.grade_revision_id,p.created_at,g.earned_units,g.criterion_scores,g.learner_feedback FROM gradebook_publications p JOIN gradebook_grade_revisions g ON g.id=p.grade_revision_id WHERE p.recipient_id=$1 ORDER BY p.sequence DESC LIMIT 1', [recipientId]);
            const g = released.rows[0];
            return { recipientId: row.recipient_id, classId: row.class_id, assignmentId: row.assignment_id, policyVersionId: row.policy_id, title: row.title, instructions: row.instructions, prompt: times.isOpen ? row.prompt : '', criteria: times.isOpen ? row.criteria : [], maxUnits: row.max_units, availableAt: date(row.available_at), dueAt: date(row.due_at), closesAt: date(row.closes_at), responseDraft: times.isOpen ? response : { revision: 0, text: '', updatedAt: null }, submission: attempt.rows[0] ? this.receipt(row, attempt.rows[0], response.revision) : null, releasedGrade: g ? { gradeRevisionId: g.grade_revision_id, earnedUnits: Number(g.earned_units), criterionScores: g.criterion_scores, learnerFeedback: g.learner_feedback, publishedAt: iso(g.created_at) } : null, isExcused: false, ...times };
        });
    }
    async saveResponse(input: {
        recipientId: string;
        expectedRevision: number;
        text: string;
        requestKey: string;
    }): Promise<WrittenResponseSave> {
        id(input.recipientId);
        rev(input.expectedRevision);
        key(input.requestKey);
        text(input.text, 100000);
        if (Buffer.byteLength(input.text, 'utf8') > 100000)
            throw new WrittenAssessmentValidationError();
        const fingerprint = hash({ operation: 'save_response', recipientId: input.recipientId.toLowerCase(), expectedRevision: input.expectedRevision, text: input.text });
        return this.db.transaction(async (c) => {
            await this.lock(c, input.requestKey);
            const row = await this.recipient(c, input.recipientId);
            const current = await this.response(c, row.recipient_id);
            const prior = await this.prior<WrittenResponseDraft>(c, input.requestKey, fingerprint);
            if (prior)
                return { responseDraft: prior, currentRevision: current.revision };
            const times = await this.timing(c, row);
            if (row.applicability !== 'assigned' || !times.isOpen || times.isClosed)
                throw new WrittenAssessmentAccessError();
            if ((await c.query('SELECT id FROM gradebook_attempts WHERE recipient_id=$1', [row.recipient_id])).rowCount)
                throw new WrittenAssessmentConflictError(current.revision, 'submitted');
            if (current.revision !== input.expectedRevision)
                throw new WrittenAssessmentConflictError(current.revision);
            const r = await c.query<{
                revision: number;
                text: string;
                updated_at: Date;
            }>(current.revision === 0 ? `WITH received AS MATERIALIZED(SELECT clock_timestamp() AS at) INSERT INTO written_response_drafts(recipient_id,policy_id,revision,text,updated_at) SELECT $1,$2,$3,$4,at FROM received WHERE ($5::timestamptz IS NULL OR at>=$5) AND ($6::timestamptz IS NULL OR at<=$6) RETURNING revision,text,updated_at` : `WITH received AS MATERIALIZED(SELECT clock_timestamp() AS at) UPDATE written_response_drafts SET revision=$3,text=$4,updated_at=received.at FROM received WHERE recipient_id=$1 AND policy_id=$2 AND revision=$3-1 AND ($5::timestamptz IS NULL OR at>=$5) AND ($6::timestamptz IS NULL OR at<=$6) RETURNING revision,text,updated_at`, [row.recipient_id, row.policy_id, current.revision + 1, input.text, row.available_at, row.closes_at]);
            if (!r.rows[0])
                throw new WrittenAssessmentAccessError();
            const accepted = { revision: r.rows[0].revision, text: r.rows[0].text, updatedAt: iso(r.rows[0].updated_at) };
            await this.record(c, row.draft_id, row.id, row.recipient_id, 'save_response', input.requestKey, fingerprint, accepted);
            return { responseDraft: accepted, currentRevision: accepted.revision };
        });
    }
    async submitResponse(input: {
        recipientId: string;
        expectedRevision: number;
        requestKey: string;
    }): Promise<WrittenSubmissionReceipt> {
        id(input.recipientId);
        rev(input.expectedRevision);
        key(input.requestKey);
        const fingerprint = hash({ operation: 'submit_response', recipientId: input.recipientId.toLowerCase(), expectedRevision: input.expectedRevision });
        return this.db.transaction(async (c) => {
            await this.lock(c, input.requestKey);
            const row = await this.recipient(c, input.recipientId);
            const prior = await this.prior<WrittenSubmissionReceipt>(c, input.requestKey, fingerprint);
            if (prior)
                return prior;
            const times = await this.timing(c, row);
            if (row.applicability !== 'assigned' || !times.isOpen || times.isClosed)
                throw new WrittenAssessmentAccessError();
            const current = await this.response(c, row.recipient_id);
            if ((await c.query('SELECT id FROM gradebook_attempts WHERE recipient_id=$1', [row.recipient_id])).rowCount)
                throw new WrittenAssessmentConflictError(current.revision, 'submitted');
            if (current.revision !== input.expectedRevision)
                throw new WrittenAssessmentConflictError(current.revision);
            if (!current.text.trim())
                throw new WrittenAssessmentValidationError('Save a nonempty response before submitting.');
            const r = await c.query<AttemptRow>(`WITH received AS MATERIALIZED(SELECT clock_timestamp() AS at) INSERT INTO gradebook_attempts(recipient_id,policy_id,response_revision_id,sequence,response,request_key,submitted_at) SELECT $1,$2,$3,1,$4,$5,at FROM received WHERE ($6::timestamptz IS NULL OR at>=$6) AND ($7::timestamptz IS NULL OR at<=$7) RETURNING id,response_revision_id,submitted_at`, [row.recipient_id, row.policy_id, randomUUID(), JSON.stringify({ kind: 'text', text: current.text }), input.requestKey, row.available_at, row.closes_at]);
            if (!r.rows[0])
                throw new WrittenAssessmentAccessError();
            const accepted = this.receipt(row, r.rows[0], current.revision);
            await this.record(c, row.draft_id, row.id, row.recipient_id, 'submit_response', input.requestKey, fingerprint, accepted);
            return accepted;
        });
    }
}

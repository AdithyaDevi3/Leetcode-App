import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  canPerformAdministrationAction, freezeAssignmentGradePolicy, freezeMultipleChoiceAnswers,
  freezeQuizQuestionSelection, MULTIPLE_CHOICE_SCORING_VERSION, scoreMultipleChoiceQuiz, toLearnerQuestion,
  type AdministrationRole, type LearnerQuestion, type MultipleChoiceQuizSnapshot, type QuizAnswers,
} from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';
import type { StoredAssessmentDraft } from './assessment-draft.repository.js';
import type { StoredGradebookGrade, StoredGradebookPublication } from './gradebook.repository.js';

export type { QuizAnswers } from '@leetcode-app/domain';
export type QuizAssignmentPrincipal = { role: 'learner' | 'instructor' | 'administrator'; userId: string };
export type QuizAudience = { kind: 'class' | 'selected'; learnerIds: readonly string[] };
export type StoredQuizPublication = {
  id: string; draftId: string; draftRevision: number; classId: string; assignmentId: string; policyVersionId: string;
  recipientCount: number; audienceKind: 'class' | 'selected'; publishedAt: string;
};
export type QuizAuthorDraft = {
  draft: StoredAssessmentDraft; learners: { id: string; displayName: string; email: string | null }[];
  rosterFingerprint: string; publication: StoredQuizPublication | null;
};
export type QuizAnswerDraft = { revision: number; answers: QuizAnswers; updatedAt: string | null };
export type QuizAnswerSave = { answerDraft: QuizAnswerDraft; currentRevision: number };
export type QuizSubmissionReceipt = { attemptId: string; responseRevisionId: string; answerRevision: number; submittedAt: string; isLate: boolean };
export type LearnerQuizAssignment = {
  recipientId: string; classId: string; assignmentId: string; policyVersionId: string; title: string; instructions: string;
  maxUnits: number; availableAt: string | null; dueAt: string | null; closesAt: string | null;
  questions: readonly (LearnerQuestion & { maxUnits: number })[]; questionCount: number;
  answerDraft: QuizAnswerDraft; submission: QuizSubmissionReceipt | null;
  releasedGrade: { gradeRevisionId: string; earnedUnits: number; publishedAt: string } | null;
  isOpen: boolean; isClosed: boolean;
};
export type InstructorQuizAssignment = LearnerQuizAssignment & {
  learner: { id: string; displayName: string; email: string | null };
  grade: StoredGradebookGrade | null; publication: StoredGradebookPublication | null;
};
export class QuizAssignmentAccessError extends Error {
  constructor() { super('This quiz is not available.'); this.name = 'QuizAssignmentAccessError'; }
}
export class QuizAssignmentValidationError extends Error {
  constructor(message = 'The quiz request is invalid.') { super(message); this.name = 'QuizAssignmentValidationError'; }
}
export class QuizAssignmentConflictError extends Error {
  constructor(public readonly currentRevision?: number, public readonly code: 'revision_changed' | 'already_published' | 'roster_changed' | 'submitted' = 'revision_changed') {
    super(code === 'roster_changed' ? 'The class roster changed. Refresh the audience before assigning.'
      : code === 'already_published' ? 'This draft has already been assigned.'
      : code === 'submitted' ? 'This quiz has already been submitted.' : 'This quiz changed or the request key was reused. Reload before trying again.');
    this.name = 'QuizAssignmentConflictError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: Date | string): string => new Date(value).toISOString();
const date = (value: Date | string | null): string | null => value === null ? null : iso(value);
const id = (value: string): string => { if (typeof value !== 'string' || !uuid.test(value)) throw new QuizAssignmentAccessError(); return value.toLowerCase(); };
const revision = (value: number): number => { if (!Number.isSafeInteger(value) || value < 0) throw new QuizAssignmentValidationError('A valid saved revision is required.'); return value; };
const key = (value: string): string => { if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new QuizAssignmentValidationError('A valid request key is required.'); return value; };
type PublicationRow = {
  id: string; draft_id: string; draft_revision: number; class_id: string; assignment_id: string; policy_id: string;
  audience_kind: 'class' | 'selected'; audience_learner_ids: string[]; created_at: Date; title: string; instructions: string;
  snapshot: MultipleChoiceQuizSnapshot; snapshot_hash: string; available_at: Date | null; due_at: Date | null; closes_at: Date | null;
};
type RecipientRow = PublicationRow & { recipient_id: string; learner_id: string; learner_name: string; learner_email: string | null };
type AnswerRow = { revision: number; answers: QuizAnswers; updated_at: Date };
type AttemptRow = { id: string; response_revision_id: string; submitted_at: Date; answer_revision: number };
const publication = (row: PublicationRow): StoredQuizPublication => ({
  id: row.id, draftId: row.draft_id, draftRevision: row.draft_revision, classId: row.class_id,
  assignmentId: row.assignment_id, policyVersionId: row.policy_id, recipientCount: row.audience_learner_ids.length,
  audienceKind: row.audience_kind, publishedAt: iso(row.created_at),
});

/** Trusted server boundary. Browser roles never receive direct access to snapshots or scoring evidence. */
export class PostgresQuizAssignmentRepository {
  private readonly principal: QuizAssignmentPrincipal;
  constructor(private readonly db: DatabaseClient, principal: QuizAssignmentPrincipal) {
    if (!principal || !['learner', 'instructor', 'administrator'].includes(principal.role)) throw new QuizAssignmentAccessError();
    this.principal = Object.freeze({ role: principal.role, userId: id(principal.userId) });
  }

  private async authorizeClass(client: PoolClient, classId: string, mode: 'author' | 'learner' | 'instructor'): Promise<void> {
    if (mode === 'learner' ? this.principal.role !== 'learner' : mode === 'instructor' ? this.principal.role !== 'instructor' : this.principal.role === 'learner') throw new QuizAssignmentAccessError();
    const user = await client.query<{ role: string }>('SELECT role FROM users WHERE id=$1 FOR SHARE', [this.principal.userId]);
    if (!user.rows[0]) throw new QuizAssignmentAccessError();
    if (this.principal.role === 'administrator') {
      const roles = await client.query<{ role: AdministrationRole }>('SELECT role FROM administration_role_assignments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE', [this.principal.userId]);
      if (!canPerformAdministrationAction(roles.rows.map(row => row.role), 'classes.manage')) throw new QuizAssignmentAccessError();
    } else if (this.principal.role === 'learner' ? user.rows[0].role !== 'learner' : !['instructor', 'admin'].includes(user.rows[0].role)) throw new QuizAssignmentAccessError();
    const classroom = await client.query(`SELECT id FROM classrooms WHERE id=$1 AND archived_at IS NULL
      AND ($2::boolean OR created_by=$3) FOR SHARE`, [classId, mode === 'learner' || this.principal.role === 'administrator', this.principal.userId]);
    if (!classroom.rows[0]) throw new QuizAssignmentAccessError();
  }

  private async requestLock(client: PoolClient, requestKey: string): Promise<void> {
    key(requestKey);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`quiz-request:${this.principal.userId}:${requestKey}`]);
  }

  private async prior<T>(client: PoolClient, requestKey: string, fingerprint: string): Promise<T | null> {
    const result = await client.query<{ request_fingerprint: string; response: T }>('SELECT request_fingerprint,response FROM quiz_request_receipts WHERE actor_id=$1 AND request_key=$2', [this.principal.userId, requestKey]);
    if (!result.rows[0]) return null;
    if (result.rows[0].request_fingerprint !== fingerprint) throw new QuizAssignmentConflictError();
    return result.rows[0].response;
  }

  private async record(client: PoolClient, row: PublicationRow, recipientId: string | null, operation: 'publish' | 'save' | 'submit', requestKey: string, fingerprint: string, response: unknown): Promise<void> {
    await client.query(`INSERT INTO quiz_request_receipts (actor_id,request_key,publication_id,recipient_id,operation,request_fingerprint,response)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [this.principal.userId, requestKey, row.id, recipientId, operation, fingerprint, JSON.stringify(response)]);
  }

  private async draft(client: PoolClient, draftId: string, classId: string, lock: boolean): Promise<StoredAssessmentDraft> {
    const result = await client.query(`SELECT * FROM assessment_drafts WHERE id=$1 AND class_id=$2 ${lock ? 'FOR UPDATE' : ''}`, [draftId, classId]);
    const row = result.rows[0];
    if (!row) throw new QuizAssignmentAccessError();
    return { id: row.id, classId: row.class_id, title: row.title, instructions: row.instructions, questions: row.questions,
      availableAt: date(row.available_at), dueAt: date(row.due_at), closesAt: date(row.closes_at), revision: row.revision,
      status: 'draft', maxUnits: row.max_units, createdBy: row.created_by, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
  }

  private async roster(client: PoolClient, classId: string, lock = false): Promise<QuizAuthorDraft['learners']> {
    const result = await client.query<{ id: string; displayName: string; email: string | null }>(`
      SELECT u.id,u.display_name AS "displayName",u.email FROM class_enrollments e JOIN users u ON u.id=e.user_id
      WHERE e.class_id=$1 ORDER BY u.id ${lock ? 'FOR SHARE OF e, u' : ''}`, [classId]);
    return result.rows;
  }

  async readAuthorDraft(draftId: string): Promise<QuizAuthorDraft> {
    id(draftId);
    return this.db.transaction(async client => {
      const identity = await client.query<{ class_id: string }>('SELECT class_id FROM assessment_drafts WHERE id=$1', [draftId]);
      if (!identity.rows[0]) throw new QuizAssignmentAccessError();
      await this.authorizeClass(client, identity.rows[0].class_id, 'author');
      const draft = await this.draft(client, draftId, identity.rows[0].class_id, false);
      const learners = await this.roster(client, draft.classId);
      const existing = await client.query<PublicationRow>('SELECT * FROM quiz_publications WHERE draft_id=$1', [draftId]);
      return { draft, learners, rosterFingerprint: hash(learners.map(person => person.id)), publication: existing.rows[0] ? publication(existing.rows[0]) : null };
    });
  }

  async publishDraft(input: {
    draftId: string; expectedRevision: number; audience: QuizAudience; expectedRosterFingerprint: string;
    snapshot?: MultipleChoiceQuizSnapshot; requestKey: string; reason: string;
  }): Promise<StoredQuizPublication> {
    id(input.draftId); revision(input.expectedRevision); key(input.requestKey);
    if (input.expectedRevision < 1 || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 4000
      || typeof input.expectedRosterFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.expectedRosterFingerprint)
      || !input.audience || !['class', 'selected'].includes(input.audience.kind) || !Array.isArray(input.audience.learnerIds)
      || !input.audience.learnerIds.length || input.audience.learnerIds.length > 5000) throw new QuizAssignmentValidationError();
    const learners = input.audience.learnerIds.map(id).sort();
    if (new Set(learners).size !== learners.length) throw new QuizAssignmentValidationError('Choose distinct learners.');
    const fingerprint = hash({ operation: 'publish', draftId: input.draftId.toLowerCase(), expectedRevision: input.expectedRevision,
      audience: { kind: input.audience.kind, learnerIds: learners }, expectedRosterFingerprint: input.expectedRosterFingerprint, reason: input.reason.trim() });
    return this.db.transaction(async client => {
      await this.requestLock(client, input.requestKey);
      const identity = await client.query<{ class_id: string; created_by: string | null }>('SELECT class_id,created_by FROM assessment_drafts WHERE id=$1', [input.draftId]);
      if (!identity.rows[0]) throw new QuizAssignmentAccessError();
      await this.authorizeClass(client, identity.rows[0].class_id, 'author');
      // Same class lock as enrollment admission; no late join can change the confirmed roster mid-publication.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [identity.rows[0].class_id]);
      // Lock every referenced account before its enrollment/draft children. Deleting an old draft author
      // SET NULLs created_by; deleting an enrolled account cascades enrollment. Neither may invert this order.
      await client.query(`SELECT u.id FROM users u WHERE u.id=$2 OR EXISTS (
        SELECT 1 FROM class_enrollments e WHERE e.class_id=$1 AND e.user_id=u.id) ORDER BY u.id FOR SHARE OF u`,
      [identity.rows[0].class_id, identity.rows[0].created_by]);
      const current = await this.draft(client, input.draftId, identity.rows[0].class_id, true);
      const prior = await this.prior<StoredQuizPublication>(client, input.requestKey, fingerprint);
      if (prior) return prior;
      if ((await client.query('SELECT id FROM quiz_publications WHERE draft_id=$1', [input.draftId])).rows.length) throw new QuizAssignmentConflictError(current.revision, 'already_published');
      if (current.revision !== input.expectedRevision) throw new QuizAssignmentConflictError(current.revision);
      let snapshot: MultipleChoiceQuizSnapshot;
      try {
        if (!input.snapshot) throw new Error();
        snapshot = freezeQuizQuestionSelection(input.snapshot.questions);
        if (input.snapshot.scoringVersion !== snapshot.scoringVersion || input.snapshot.maxUnits !== snapshot.maxUnits) throw new Error();
      } catch { throw new QuizAssignmentValidationError('Choose reviewed question versions and valid points.'); }
      if (current.questions.length !== snapshot.questions.length || current.questions.some((question, index) =>
        question.questionVersionId !== snapshot.questions[index].question.versionId || question.maxUnits !== snapshot.questions[index].maxUnits)) {
        throw new QuizAssignmentValidationError('Published questions must match the saved draft.');
      }
      const roster = await this.roster(client, current.classId, true);
      const rosterIds = roster.map(person => person.id);
      if (hash(rosterIds) !== input.expectedRosterFingerprint || (input.audience.kind === 'class' && JSON.stringify(learners) !== JSON.stringify(rosterIds))) throw new QuizAssignmentConflictError(current.revision, 'roster_changed');
      if (learners.some(learnerId => !rosterIds.includes(learnerId))) throw new QuizAssignmentValidationError('Choose enrolled learners.');
      const contentId = randomUUID(), contentVersionId = randomUUID(), assignmentId = randomUUID(), policyId = randomUUID();
      await client.query(`INSERT INTO content_items (id,slug,type,status,difficulty,estimated_minutes,class_private)
        VALUES ($1,$2,'quiz','draft','beginner',$3,true)`, [contentId, `class-quiz-${contentId}`, Math.max(1, snapshot.questions.length * 2)]);
      // Generic content storage deliberately contains no class title/instructions, question text, or keys.
      const content = await client.query(`INSERT INTO content_versions (id,content_id,version,title,description,markdown_content)
        VALUES ($1,$2,1,'Class assessment','','') RETURNING to_jsonb(content_versions) AS snapshot`, [contentVersionId, contentId]);
      await client.query(`INSERT INTO class_assignments (id,class_id,content_id,title,instructions,due_on,created_by)
        VALUES ($1,$2,$3,$4,$5,CASE WHEN $6::timestamptz IS NULL THEN NULL ELSE ($6::timestamptz AT TIME ZONE 'UTC')::date END,$7)`,
      [assignmentId, current.classId, contentId, current.title, current.instructions, current.dueAt, this.principal.userId]);
      const policy = freezeAssignmentGradePolicy({ assignmentId, versionId: policyId, contentVersionId, maxUnits: snapshot.maxUnits,
        attemptPolicy: 'latest', scoring: { mode: 'multiple_choice', scoringVersion: MULTIPLE_CHOICE_SCORING_VERSION, attemptLimit: 1, releasePolicy: 'instructor', audience: 'frozen' } });
      await client.query(`INSERT INTO gradebook_policies (id,assignment_id,content_version_id,policy,content_snapshot,closes_at,created_by,reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [policyId, assignmentId, contentVersionId, policy, content.rows[0].snapshot, current.closesAt, this.principal.userId, input.reason.trim()]);
      await client.query('INSERT INTO gradebook_recipients (policy_id,learner_id) SELECT $1,unnest($2::uuid[])', [policyId, learners]);
      const result = await client.query<PublicationRow>(`INSERT INTO quiz_publications
        (draft_id,draft_revision,class_id,assignment_id,policy_id,title,instructions,audience_kind,audience_learner_ids,roster_fingerprint,
          snapshot,snapshot_hash,available_at,due_at,closes_at,published_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,encode(sha256(convert_to($11::jsonb::text,'UTF8')),'hex'),$12,$13,$14,$15) RETURNING *`,
      [current.id, current.revision, current.classId, assignmentId, policyId, current.title, current.instructions, input.audience.kind,
        learners, input.expectedRosterFingerprint, JSON.stringify(snapshot), current.availableAt, current.dueAt, current.closesAt, this.principal.userId]);
      const accepted = publication(result.rows[0]);
      await this.record(client, result.rows[0], null, 'publish', input.requestKey, fingerprint, accepted);
      await client.query(`INSERT INTO administration_audit_events (actor_id,action,target_type,target_id,reason,metadata)
        VALUES ($1,'assessments.quiz.publish','quiz_publication',$2,$3,$4)`, [this.principal.userId, accepted.id, input.reason.trim(),
        { classId: current.classId, draftId: current.id, draftRevision: current.revision, recipientCount: learners.length, audienceKind: input.audience.kind }]);
      return accepted;
    });
  }

  private async recipient(client: PoolClient, recipientId: string, mode: 'learner' | 'instructor'): Promise<RecipientRow> {
    id(recipientId);
    const identity = await client.query<{ class_id: string; learner_id: string }>(`SELECT p.class_id,r.learner_id
      FROM gradebook_recipients r JOIN quiz_publications p ON p.policy_id=r.policy_id WHERE r.id=$1`, [recipientId]);
    if (!identity.rows[0] || (mode === 'learner' && identity.rows[0].learner_id !== this.principal.userId)) throw new QuizAssignmentAccessError();
    await this.authorizeClass(client, identity.rows[0].class_id, mode);
    if (mode === 'learner') {
      const enrollment = await client.query('SELECT user_id FROM class_enrollments WHERE class_id=$1 AND user_id=$2 FOR SHARE', [identity.rows[0].class_id, this.principal.userId]);
      if (!enrollment.rows.length) throw new QuizAssignmentAccessError();
    }
    const result = await client.query<RecipientRow>(`SELECT p.*,r.id AS recipient_id,r.learner_id,u.display_name AS learner_name,u.email AS learner_email
      FROM gradebook_recipients r JOIN quiz_publications p ON p.policy_id=r.policy_id
      JOIN users u ON u.id=r.learner_id WHERE r.id=$1 AND p.class_id=$2 AND r.learner_id=$3 FOR UPDATE OF r`,
    [recipientId, identity.rows[0].class_id, identity.rows[0].learner_id]);
    if (!result.rows[0]) throw new QuizAssignmentAccessError();
    const applicability = await client.query<{ applicability: string }>('SELECT applicability FROM gradebook_applicability_revisions WHERE recipient_id=$1 ORDER BY sequence DESC LIMIT 1', [recipientId]);
    if (!applicability.rows[0] || (mode === 'learner' && applicability.rows[0].applicability !== 'assigned')) throw new QuizAssignmentAccessError();
    return result.rows[0];
  }

  private async timing(client: PoolClient, row: PublicationRow): Promise<{ isOpen: boolean; isClosed: boolean }> {
    // Evaluate only after authorization/enrollment/recipient locks have actually been acquired.
    return (await client.query<{ isOpen: boolean; isClosed: boolean }>(`SELECT
      ($1::timestamptz IS NULL OR clock_timestamp() >= $1) AS "isOpen",
      ($2::timestamptz IS NOT NULL AND clock_timestamp() > $2) AS "isClosed"`, [row.available_at, row.closes_at])).rows[0];
  }

  private async answerDraft(client: PoolClient, row: RecipientRow): Promise<QuizAnswerDraft> {
    const saved = await client.query<AnswerRow>('SELECT revision,answers,updated_at FROM quiz_answer_drafts WHERE recipient_id=$1', [row.recipient_id]);
    return saved.rows[0] ? { revision: saved.rows[0].revision, answers: saved.rows[0].answers, updatedAt: iso(saved.rows[0].updated_at) }
      : { revision: 0, answers: freezeMultipleChoiceAnswers(row.snapshot, {}), updatedAt: null };
  }

  private receipt(row: RecipientRow, attempt: AttemptRow): QuizSubmissionReceipt {
    return { attemptId: attempt.id, responseRevisionId: attempt.response_revision_id, answerRevision: attempt.answer_revision,
      submittedAt: iso(attempt.submitted_at), isLate: row.due_at !== null && attempt.submitted_at > row.due_at };
  }

  private async view(client: PoolClient, row: RecipientRow, instructor: boolean): Promise<InstructorQuizAssignment> {
    const times = await this.timing(client, row);
    const attempts = await client.query<AttemptRow>(`SELECT a.id,a.response_revision_id,a.submitted_at,e.answer_revision
      FROM gradebook_attempts a JOIN quiz_score_evidence e ON e.attempt_id=a.id WHERE a.recipient_id=$1`, [row.recipient_id]);
    const grade = await client.query(`SELECT * FROM gradebook_grade_revisions WHERE recipient_id=$1 ORDER BY sequence DESC LIMIT 1`, [row.recipient_id]);
    const published = await client.query(`SELECT p.*,g.earned_units FROM gradebook_publications p JOIN gradebook_grade_revisions g ON g.id=p.grade_revision_id
      WHERE p.recipient_id=$1 ORDER BY p.sequence DESC LIMIT 1`, [row.recipient_id]);
    const latestGrade = grade.rows[0], latestPublication = published.rows[0];
    return {
      recipientId: row.recipient_id, classId: row.class_id, assignmentId: row.assignment_id, policyVersionId: row.policy_id,
      title: row.title, instructions: row.instructions, maxUnits: row.snapshot.maxUnits, availableAt: date(row.available_at), dueAt: date(row.due_at), closesAt: date(row.closes_at),
      questions: instructor || times.isOpen ? row.snapshot.questions.map(({ question, maxUnits }) => ({ ...toLearnerQuestion(question), maxUnits })) : [],
      questionCount: row.snapshot.questions.length,
      answerDraft: instructor || times.isOpen ? await this.answerDraft(client, row) : { revision: 0, answers: {}, updatedAt: null },
      submission: attempts.rows[0] ? this.receipt(row, attempts.rows[0]) : null,
      releasedGrade: latestPublication ? { gradeRevisionId: latestPublication.grade_revision_id, earnedUnits: Number(latestPublication.earned_units), publishedAt: iso(latestPublication.created_at) } : null,
      ...times, learner: { id: row.learner_id, displayName: row.learner_name, email: row.learner_email },
      grade: latestGrade ? { id: latestGrade.id, sequence: latestGrade.sequence, earnedUnits: Number(latestGrade.earned_units), kind: latestGrade.kind,
        attemptId: latestGrade.attempt_id, criterionScores: {}, learnerFeedback: latestGrade.learner_feedback, privateNote: latestGrade.private_note, createdAt: iso(latestGrade.created_at) } : null,
      publication: latestPublication ? { id: latestPublication.id, sequence: latestPublication.sequence, gradeRevisionId: latestPublication.grade_revision_id, publishedAt: iso(latestPublication.created_at) } : null,
    };
  }

  async readLearnerQuiz(recipientId: string): Promise<LearnerQuizAssignment> {
    return this.db.transaction(async client => {
      const row = await this.recipient(client, recipientId, 'learner');
      const { learner: _learner, grade: _grade, publication: _publication, ...safe } = await this.view(client, row, false);
      return safe;
    });
  }

  async readInstructorQuiz(recipientId: string): Promise<InstructorQuizAssignment> {
    return this.db.transaction(async client => this.view(client, await this.recipient(client, recipientId, 'instructor'), true));
  }

  async saveAnswers(input: { recipientId: string; expectedRevision: number; answers: QuizAnswers; requestKey: string }): Promise<QuizAnswerSave> {
    id(input.recipientId); revision(input.expectedRevision); key(input.requestKey);
    return this.db.transaction(async client => {
      await this.requestLock(client, input.requestKey);
      const row = await this.recipient(client, input.recipientId, 'learner');
      if (!(await this.timing(client, row)).isOpen) throw new QuizAssignmentAccessError();
      let answers: QuizAnswers;
      try { answers = freezeMultipleChoiceAnswers(row.snapshot, input.answers); } catch { throw new QuizAssignmentValidationError('Choose valid options from this assigned quiz.'); }
      const fingerprint = hash({ operation: 'save', recipientId: row.recipient_id, expectedRevision: input.expectedRevision, answers });
      const current = await this.answerDraft(client, row);
      const prior = await this.prior<QuizAnswerDraft>(client, input.requestKey, fingerprint);
      if (prior) return { answerDraft: prior, currentRevision: current.revision };
      const times = await this.timing(client, row);
      if (!times.isOpen || times.isClosed) throw new QuizAssignmentAccessError();
      if ((await client.query('SELECT id FROM gradebook_attempts WHERE recipient_id=$1', [row.recipient_id])).rows.length) throw new QuizAssignmentConflictError(current.revision, 'submitted');
      if (current.revision !== input.expectedRevision) throw new QuizAssignmentConflictError(current.revision);
      const result = await client.query<AnswerRow>(current.revision === 0
        ? `WITH received AS MATERIALIZED (SELECT clock_timestamp() AS at)
          INSERT INTO quiz_answer_drafts (recipient_id,policy_id,revision,answers,updated_at)
          SELECT $1,$2,$3,$4,at FROM received WHERE ($5::timestamptz IS NULL OR at >= $5) AND ($6::timestamptz IS NULL OR at <= $6)
          RETURNING revision,answers,updated_at`
        : `WITH received AS MATERIALIZED (SELECT clock_timestamp() AS at)
          UPDATE quiz_answer_drafts SET revision=$3,answers=$4,updated_at=received.at FROM received
          WHERE recipient_id=$1 AND policy_id=$2 AND revision=$3-1 AND ($5::timestamptz IS NULL OR at >= $5) AND ($6::timestamptz IS NULL OR at <= $6)
          RETURNING revision,answers,updated_at`,
      [row.recipient_id, row.policy_id, current.revision + 1, JSON.stringify(answers), row.available_at, row.closes_at]);
      if (!result.rows[0]) throw new QuizAssignmentAccessError();
      const accepted = { revision: result.rows[0].revision, answers: result.rows[0].answers, updatedAt: iso(result.rows[0].updated_at) };
      await this.record(client, row, row.recipient_id, 'save', input.requestKey, fingerprint, accepted);
      return { answerDraft: accepted, currentRevision: accepted.revision };
    });
  }

  async submitQuiz(input: { recipientId: string; expectedRevision: number; requestKey: string }): Promise<QuizSubmissionReceipt> {
    id(input.recipientId); revision(input.expectedRevision); key(input.requestKey);
    const fingerprint = hash({ operation: 'submit', recipientId: input.recipientId.toLowerCase(), expectedRevision: input.expectedRevision });
    return this.db.transaction(async client => {
      await this.requestLock(client, input.requestKey);
      const row = await this.recipient(client, input.recipientId, 'learner');
      const prior = await this.prior<QuizSubmissionReceipt>(client, input.requestKey, fingerprint);
      if (prior) return prior;
      const times = await this.timing(client, row);
      if (!times.isOpen || times.isClosed) throw new QuizAssignmentAccessError();
      const current = await this.answerDraft(client, row);
      if ((await client.query('SELECT id FROM gradebook_attempts WHERE recipient_id=$1', [row.recipient_id])).rows.length) throw new QuizAssignmentConflictError(current.revision, 'submitted');
      if (current.revision !== input.expectedRevision) throw new QuizAssignmentConflictError(current.revision);
      const score = scoreMultipleChoiceQuiz(row.snapshot, current.answers);
      const result = await client.query<AttemptRow>(`WITH received AS MATERIALIZED (SELECT clock_timestamp() AS at)
        INSERT INTO gradebook_attempts (recipient_id,policy_id,response_revision_id,sequence,response,request_key,submitted_at)
        SELECT $1,$2,$3,1,$4,$5,at FROM received WHERE ($6::timestamptz IS NULL OR at >= $6) AND ($7::timestamptz IS NULL OR at <= $7)
        RETURNING id,response_revision_id,submitted_at`, [row.recipient_id, row.policy_id, randomUUID(),
        JSON.stringify({ kind: 'multiple_choice', answers: current.answers }), input.requestKey, row.available_at, row.closes_at]);
      if (!result.rows[0]) throw new QuizAssignmentAccessError();
      const attempt = result.rows[0];
      const evidence = await client.query<{ id: string }>(`INSERT INTO quiz_score_evidence
        (attempt_id,recipient_id,policy_id,publication_id,answer_revision,scoring_version,snapshot_hash,response_hash,earned_units,max_units,result)
        SELECT $1,$2,$3,$4,$5,$6,$7,encode(sha256(convert_to(response::text,'UTF8')),'hex'),$8,$9,$10 FROM gradebook_attempts WHERE id=$1 RETURNING id`,
      [attempt.id, row.recipient_id, row.policy_id, row.id, current.revision, score.scoringVersion, row.snapshot_hash, score.earnedUnits, score.maxUnits, JSON.stringify(score)]);
      await client.query(`INSERT INTO gradebook_grade_revisions
        (recipient_id,policy_id,sequence,attempt_id,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key,quiz_score_id)
        VALUES ($1,$2,1,$3,'scored',$4,$5,'{}','Deterministic scoring of the pinned class quiz',NULL,$6,$7)`,
      [row.recipient_id, row.policy_id, attempt.id, score.earnedUnits, score.scoringVersion, `quiz:${attempt.id}`, evidence.rows[0].id]);
      const accepted = this.receipt(row, { ...attempt, answer_revision: current.revision });
      await this.record(client, row, row.recipient_id, 'submit', input.requestKey, fingerprint, accepted);
      return accepted;
    });
  }
}

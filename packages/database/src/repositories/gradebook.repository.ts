import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { freezeAssignmentGradePolicy, type AssignmentGradePolicy } from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';

export class GradebookAccessError extends Error {
  constructor() { super('Gradebook record is unavailable.'); this.name = 'GradebookAccessError'; }
}
export class GradebookConflictError extends Error {
  constructor() { super('The gradebook record changed or the request key was reused.'); this.name = 'GradebookConflictError'; }
}
export class GradebookRateLimitError extends Error {
  constructor() { super('Too many assignment submissions.'); this.name = 'GradebookRateLimitError'; }
}
export const ASSIGNMENT_VERIFIER_VERSION = 'stdin-stdout-v1';

function validPinnedTests(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= 5 && value.every((test) => {
    if (!test || typeof test !== 'object' || Array.isArray(test)) return false;
    const record = test as Record<string, unknown>;
    return typeof record.input === 'string' && new TextEncoder().encode(record.input).byteLength <= 50_000
      && typeof record.expected === 'string' && new TextEncoder().encode(record.expected).byteLength <= 50_000;
  });
}

export type GradebookPrincipal = Readonly<{ role: 'instructor' | 'learner'; userId: string }>;
export type AssignmentResponse = Readonly<{ text: string; language?: string }>;
export type StoredGradebookAttempt = { id: string; responseRevisionId: string; sequence: number; response: AssignmentResponse; verificationJobId?: string; verificationStatus?: string };
export type StoredGradebookGrade = { id: string; sequence: number; earnedUnits: number; kind: 'scored' | 'missing_zero'; attemptId: string | null };
export type StoredGradebookPublication = { id: string; sequence: number; gradeRevisionId: string };
export type GradebookRecipientHistory = {
  recipientId: string; learnerId: string; policy: AssignmentGradePolicy;
  attempts: StoredGradebookAttempt[]; grades: StoredGradebookGrade[]; publications: StoredGradebookPublication[];
};

type Recipient = {
  id: string; learner_id: string; policy_id: string; policy: AssignmentGradePolicy;
  content_snapshot: { test_cases?: unknown }; closes_at: Date | null; archived_at: Date | null; enrolled: boolean;
};
type GradeRow = {
  id: string; sequence: number; earned_units: string; kind: 'scored' | 'missing_zero';
  attempt_id: string | null; supersedes_id: string | null; criterion_scores: Record<string, number>; reason: string;
};
type PublicationRow = { id: string; sequence: number; grade_revision_id: string; reason: string };
type AttemptRow = { id: string; response_revision_id: string; sequence: number; response: AssignmentResponse };

const uuid = (value: string): void => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('A UUID is required');
};
const nonblank = (value: string, maximum: number): void => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error('A nonempty value within the supported length is required');
};
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value);
};
const same = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right);
const mapAttempt = (row: AttemptRow): StoredGradebookAttempt => ({ id: row.id, responseRevisionId: row.response_revision_id, sequence: row.sequence, response: row.response });
const mapGrade = (row: GradeRow): StoredGradebookGrade => ({ id: row.id, sequence: row.sequence, earnedUnits: Number(row.earned_units), kind: row.kind, attemptId: row.attempt_id });
const mapPublication = (row: PublicationRow): StoredGradebookPublication => ({ id: row.id, sequence: row.sequence, gradeRevisionId: row.grade_revision_id });

/** Server-only persistence. The caller must supply a verified user identity, never request-body identity. */
export class PostgresGradebookRepository {
  private readonly principal: GradebookPrincipal;
  constructor(private readonly db: DatabaseClient, principal: GradebookPrincipal) {
    if (!principal || !['instructor', 'learner'].includes(principal.role)) throw new GradebookAccessError();
    uuid(principal.userId);
    this.principal = Object.freeze({ ...principal });
  }

  private requireRole(role: GradebookPrincipal['role']): void {
    if (this.principal.role !== role) throw new GradebookAccessError();
  }

  private async recipient(client: PoolClient, recipientId: string, lock: boolean): Promise<Recipient> {
    uuid(recipientId);
    const result = await client.query<Recipient>(`
      SELECT r.id, r.learner_id, r.policy_id, p.policy, p.content_snapshot, p.closes_at, c.archived_at,
        EXISTS (SELECT 1 FROM class_enrollments e WHERE e.class_id = c.id AND e.user_id = r.learner_id) AS enrolled
      FROM gradebook_recipients r
      JOIN gradebook_policies p ON p.id = r.policy_id
      JOIN class_assignments a ON a.id = p.assignment_id
      JOIN classrooms c ON c.id = a.class_id
      WHERE r.id = $1 AND CASE WHEN $2 = 'instructor' THEN c.created_by = $3::uuid ELSE r.learner_id = $3::uuid END
      ${lock ? 'FOR UPDATE OF r FOR SHARE OF c' : ''}
    `, [recipientId, this.principal.role, this.principal.userId]);
    if (!result.rows[0]) throw new GradebookAccessError();
    return result.rows[0];
  }

  private async audit(client: PoolClient, action: string, targetId: string, reason: string): Promise<void> {
    await client.query(`INSERT INTO administration_audit_events (actor_id, action, target_type, target_id, reason)
      VALUES ($1, $2, 'gradebook', $3, $4)`, [this.principal.userId, action, targetId, reason]);
  }

  async publishPolicy(input: {
    policy: AssignmentGradePolicy; learnerIds: string[]; closesAt: string | null; reason: string;
  }): Promise<{ policyId: string; recipients: { id: string; learnerId: string }[] }> {
    this.requireRole('instructor');
    const policy = freezeAssignmentGradePolicy(input.policy);
    [policy.assignmentId, policy.versionId, policy.contentVersionId, ...input.learnerIds].forEach(uuid);
    nonblank(input.reason, 4000);
    if (policy.attemptPolicy !== 'latest') throw new Error('Only latest-attempt selection is supported by grade storage');
    if (new Set(input.learnerIds).size !== input.learnerIds.length || !input.learnerIds.length) throw new Error('Choose distinct enrolled recipients');
    const closesAt = input.closesAt === null ? null : new Date(input.closesAt);
    if (closesAt && !Number.isFinite(closesAt.getTime())) throw new Error('Invalid closing time');
    return this.db.transaction(async client => {
      const assignment = await client.query<{ id: string; class_id: string; snapshot: unknown }>(`
        SELECT a.id, a.class_id, to_jsonb(cv) AS snapshot FROM class_assignments a
        JOIN classrooms c ON c.id = a.class_id
        JOIN content_versions cv ON cv.content_id = a.content_id AND cv.id = $2
        WHERE a.id = $1 AND c.created_by = $3 AND c.archived_at IS NULL
        FOR UPDATE OF a FOR SHARE OF c, cv
      `, [policy.assignmentId, policy.contentVersionId, this.principal.userId]);
      if (!assignment.rows[0]) throw new GradebookAccessError();
      if (policy.scoring.mode === 'verified_completion') {
        const snapshot = assignment.rows[0].snapshot as { test_cases?: unknown };
        if (policy.scoring.verifierVersionId !== ASSIGNMENT_VERIFIER_VERSION || !validPinnedTests(snapshot.test_cases)) {
          throw new Error('Verified assignments require the supported pinned stdin/stdout suite');
        }
      }
      const existing = await client.query<{ id: string; policy: AssignmentGradePolicy; closes_at: Date | null; reason: string }>(
        'SELECT id, policy, closes_at, reason FROM gradebook_policies WHERE assignment_id = $1', [policy.assignmentId]);
      if (existing.rows[0]) {
        const row = existing.rows[0];
        const recipients = await client.query<{ id: string; learnerId: string }>('SELECT id, learner_id AS "learnerId" FROM gradebook_recipients WHERE policy_id = $1 ORDER BY learner_id', [row.id]);
        if (!same(row.policy, policy) || row.closes_at?.toISOString() !== closesAt?.toISOString() || row.reason !== input.reason
          || !same(recipients.rows.map(r => r.learnerId).sort(), [...input.learnerIds].sort())) throw new GradebookConflictError();
        return { policyId: row.id, recipients: recipients.rows };
      }
      const enrollments = await client.query(`SELECT user_id FROM class_enrollments WHERE class_id = $1 AND user_id = ANY($2::uuid[]) FOR SHARE`, [assignment.rows[0].class_id, input.learnerIds]);
      if (enrollments.rows.length !== input.learnerIds.length) throw new GradebookAccessError();
      await client.query(`INSERT INTO gradebook_policies
        (id, assignment_id, content_version_id, policy, content_snapshot, closes_at, created_by, reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [policy.versionId, policy.assignmentId, policy.contentVersionId, policy, assignment.rows[0].snapshot, closesAt, this.principal.userId, input.reason]);
      const recipients = await client.query<{ id: string; learnerId: string }>(`INSERT INTO gradebook_recipients (policy_id, learner_id)
        SELECT $1, unnest($2::uuid[]) RETURNING id, learner_id AS "learnerId"`, [policy.versionId, input.learnerIds]);
      await this.audit(client, 'gradebook.policy.publish', policy.versionId, input.reason);
      return { policyId: policy.versionId, recipients: recipients.rows.sort((a, b) => a.learnerId.localeCompare(b.learnerId)) };
    });
  }

  async submitAttempt(input: { recipientId: string; policyVersionId: string; response: AssignmentResponse; requestKey: string }): Promise<StoredGradebookAttempt> {
    this.requireRole('learner');
    uuid(input.policyVersionId); nonblank(input.requestKey, 128);
    nonblank(input.response?.text, 100_000);
    if (input.response.language !== undefined) nonblank(input.response.language, 80);
    if (Object.keys(input.response).some(key => key !== 'text' && key !== 'language')) throw new Error('Unsupported response field');
    const response = { text: input.response.text, ...(input.response.language === undefined ? {} : { language: input.response.language }) };
    return this.db.transaction(async client => {
      const recipient = await this.recipient(client, input.recipientId, true);
      if (recipient.policy_id !== input.policyVersionId) throw new GradebookConflictError();
      const retry = await client.query<AttemptRow>('SELECT * FROM gradebook_attempts WHERE recipient_id = $1 AND request_key = $2', [recipient.id, input.requestKey]);
      if (retry.rows[0]) {
        if (!same(retry.rows[0].response, response)) throw new GradebookConflictError();
        const job = await client.query<{ id: string; status: string }>('SELECT id,status FROM gradebook_verification_jobs WHERE attempt_id = $1', [retry.rows[0].id]);
        return { ...mapAttempt(retry.rows[0]), ...(job.rows[0] ? { verificationJobId: job.rows[0].id, verificationStatus: job.rows[0].status } : {}) };
      }
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [this.principal.userId]);
      const recent = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM gradebook_attempts a
        JOIN gradebook_recipients r ON r.id = a.recipient_id
        WHERE r.learner_id = $1 AND a.submitted_at > clock_timestamp() - interval '10 minutes'`, [this.principal.userId]);
      if (Number(recent.rows[0]?.count ?? 0) >= 5) throw new GradebookRateLimitError();
      if (!recipient.enrolled || recipient.archived_at) throw new GradebookAccessError();
      // Lock the live enrollment so a concurrent withdrawal cannot race this admission.
      const enrollment = await client.query(`SELECT e.user_id FROM class_enrollments e
        JOIN class_assignments a ON a.class_id = e.class_id JOIN gradebook_policies p ON p.assignment_id = a.id
        WHERE p.id = $1 AND e.user_id = $2 FOR SHARE OF e`, [recipient.policy_id, this.principal.userId]);
      if (!enrollment.rows.length) throw new GradebookAccessError();
      const result = await client.query<AttemptRow>(`WITH receipt AS MATERIALIZED (SELECT clock_timestamp() AS received_at)
        INSERT INTO gradebook_attempts
        (recipient_id, policy_id, response_revision_id, sequence, response, request_key, submitted_at)
        SELECT $1,$2,$3, (SELECT COALESCE(MAX(sequence),0)+1 FROM gradebook_attempts WHERE recipient_id = $1),$4,$5,received_at
        FROM receipt WHERE $6::timestamptz IS NULL OR received_at <= $6
        RETURNING *`, [recipient.id, recipient.policy_id, randomUUID(), response, input.requestKey, recipient.closes_at]);
      if (!result.rows[0]) throw new GradebookAccessError();
      if (recipient.policy.scoring.mode !== 'verified_completion') return mapAttempt(result.rows[0]);
      if (!['python', 'cpp', 'typescript'].includes(response.language ?? '')) throw new Error('Verified submissions require a supported language');
      const tests = recipient.content_snapshot.test_cases;
      if (!Array.isArray(tests) || !tests.length) throw new Error('The pinned verifier has no test suite');
      const job = await client.query<{ id: string }>(`INSERT INTO gradebook_verification_jobs
        (attempt_id,recipient_id,policy_id,learner_id,verifier_version_id,language,source,pinned_tests)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [result.rows[0].id, recipient.id, recipient.policy_id,
        this.principal.userId, recipient.policy.scoring.verifierVersionId, response.language, response.text, JSON.stringify(tests)]);
      await client.query(`INSERT INTO gradebook_verification_events (verification_job_id,status,reason)
        VALUES ($1,'queued','assignment-submitted')`, [job.rows[0].id]);
      return { ...mapAttempt(result.rows[0]), verificationJobId: job.rows[0].id, verificationStatus: 'queued' };
    });
  }

  async appendGrade(input: {
    recipientId: string; attemptId: string | null; expectedGradeRevisionId: string | null;
    kind: 'scored' | 'missing_zero'; criterionScores: Record<string, number>; reason: string; requestKey: string;
  }): Promise<StoredGradebookGrade> {
    this.requireRole('instructor'); nonblank(input.reason, 4000); nonblank(input.requestKey, 128);
    if (input.attemptId !== null) uuid(input.attemptId);
    if (input.expectedGradeRevisionId !== null) uuid(input.expectedGradeRevisionId);
    return this.db.transaction(async client => {
      const recipient = await this.recipient(client, input.recipientId, true);
      const retry = await client.query<GradeRow>('SELECT * FROM gradebook_grade_revisions WHERE recipient_id = $1 AND request_key = $2', [recipient.id, input.requestKey]);
      if (retry.rows[0]) {
        const row = retry.rows[0];
        if (row.attempt_id !== input.attemptId || row.supersedes_id !== input.expectedGradeRevisionId || row.kind !== input.kind
          || row.reason !== input.reason || !same(row.criterion_scores, input.criterionScores)) throw new GradebookConflictError();
        return mapGrade(row);
      }
      if (recipient.archived_at) throw new GradebookAccessError();
      const previous = await client.query<GradeRow>('SELECT * FROM gradebook_grade_revisions WHERE recipient_id = $1 ORDER BY sequence DESC LIMIT 1', [recipient.id]);
      if ((previous.rows[0]?.id ?? null) !== input.expectedGradeRevisionId) throw new GradebookConflictError();
      let earned = 0;
      let evaluator = 'instructor-missing-zero-v1';
      if (!input.criterionScores || typeof input.criterionScores !== 'object' || Array.isArray(input.criterionScores)) throw new Error('Criterion scores are required');
      if (input.kind === 'scored') {
        const scoring = recipient.policy.scoring;
        if (scoring.mode !== 'reviewed_rubric') throw new Error('Verified-completion grades require the trusted verifier adapter');
        const attempt = await client.query('SELECT id FROM gradebook_attempts WHERE id = $1 AND recipient_id = $2', [input.attemptId, recipient.id]);
        if (!attempt.rows.length) throw new GradebookAccessError();
        if (!same(Object.keys(input.criterionScores).sort(), scoring.criteria.map(c => c.id).sort())) throw new Error('Score every published criterion exactly once');
        for (const criterion of scoring.criteria) {
          const score = input.criterionScores[criterion.id];
          if (!Number.isSafeInteger(score) || score < 0 || score > criterion.maxUnits) throw new Error('Invalid criterion points');
          earned += score;
        }
        evaluator = scoring.rubricVersionId;
      } else if (input.kind === 'missing_zero') {
        if (input.attemptId !== null || Object.keys(input.criterionScores).length) throw new Error('Missing-work zero cannot contain a scored attempt');
        const closed = await client.query('SELECT 1 WHERE $1::timestamptz IS NOT NULL AND clock_timestamp() > $1', [recipient.closes_at]);
        if (!closed.rows.length) throw new GradebookConflictError();
        const attempts = await client.query('SELECT id FROM gradebook_attempts WHERE recipient_id = $1 LIMIT 1', [recipient.id]);
        if (attempts.rows.length) throw new GradebookConflictError();
      } else throw new Error('Unsupported grade kind');
      const result = await client.query<GradeRow>(`INSERT INTO gradebook_grade_revisions
        (recipient_id,policy_id,attempt_id,supersedes_id,sequence,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [recipient.id, recipient.policy_id, input.attemptId, input.expectedGradeRevisionId, (previous.rows[0]?.sequence ?? 0) + 1,
        input.kind, earned, evaluator, input.criterionScores, input.reason, this.principal.userId, input.requestKey]);
      await this.audit(client, 'gradebook.grade.append', result.rows[0].id, input.reason);
      return mapGrade(result.rows[0]);
    });
  }

  async publishGrade(input: {
    recipientId: string; gradeRevisionId: string; expectedPublicationSequence: number; reason: string; requestKey: string;
  }): Promise<StoredGradebookPublication> {
    this.requireRole('instructor'); uuid(input.gradeRevisionId); nonblank(input.reason, 4000); nonblank(input.requestKey, 128);
    if (!Number.isSafeInteger(input.expectedPublicationSequence) || input.expectedPublicationSequence < 0) throw new Error('Invalid publication sequence');
    return this.db.transaction(async client => {
      const recipient = await this.recipient(client, input.recipientId, true);
      const retry = await client.query<PublicationRow>('SELECT * FROM gradebook_publications WHERE recipient_id = $1 AND request_key = $2', [recipient.id, input.requestKey]);
      if (retry.rows[0]) {
        const row = retry.rows[0];
        if (row.grade_revision_id !== input.gradeRevisionId || row.sequence !== input.expectedPublicationSequence + 1 || row.reason !== input.reason) throw new GradebookConflictError();
        return mapPublication(row);
      }
      if (recipient.archived_at) throw new GradebookAccessError();
      const latest = await client.query<PublicationRow>('SELECT * FROM gradebook_publications WHERE recipient_id = $1 ORDER BY sequence DESC LIMIT 1', [recipient.id]);
      if ((latest.rows[0]?.sequence ?? 0) !== input.expectedPublicationSequence) throw new GradebookConflictError();
      const grade = await client.query<GradeRow>('SELECT * FROM gradebook_grade_revisions WHERE recipient_id = $1 ORDER BY sequence DESC LIMIT 1', [recipient.id]);
      if (grade.rows[0]?.id !== input.gradeRevisionId) throw new GradebookConflictError();
      const attempt = await client.query<AttemptRow>('SELECT * FROM gradebook_attempts WHERE recipient_id = $1 ORDER BY sequence DESC LIMIT 1', [recipient.id]);
      if ((attempt.rows[0]?.id ?? null) !== grade.rows[0].attempt_id) throw new GradebookConflictError();
      const result = await client.query<PublicationRow>(`INSERT INTO gradebook_publications
        (recipient_id,policy_id,grade_revision_id,sequence,reason,published_by,request_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [recipient.id, recipient.policy_id, input.gradeRevisionId,
        input.expectedPublicationSequence + 1, input.reason, this.principal.userId, input.requestKey]);
      await this.audit(client, 'gradebook.grade.publish', result.rows[0].id, input.reason);
      return mapPublication(result.rows[0]);
    });
  }

  async readRecipient(recipientId: string): Promise<GradebookRecipientHistory> {
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const recipient = await this.recipient(client, recipientId, false);
      const attempts = await client.query<AttemptRow>('SELECT * FROM gradebook_attempts WHERE recipient_id = $1 ORDER BY sequence', [recipient.id]);
      const grades = await client.query<GradeRow>(`SELECT g.* FROM gradebook_grade_revisions g WHERE g.recipient_id = $1
        AND ($2 = 'instructor' OR EXISTS (SELECT 1 FROM gradebook_publications p WHERE p.grade_revision_id = g.id)) ORDER BY g.sequence`, [recipient.id, this.principal.role]);
      const publications = await client.query<PublicationRow>('SELECT * FROM gradebook_publications WHERE recipient_id = $1 ORDER BY sequence', [recipient.id]);
      return { recipientId, learnerId: recipient.learner_id, policy: recipient.policy, attempts: attempts.rows.map(mapAttempt),
        grades: grades.rows.map(mapGrade), publications: publications.rows.map(mapPublication) };
    });
  }
}

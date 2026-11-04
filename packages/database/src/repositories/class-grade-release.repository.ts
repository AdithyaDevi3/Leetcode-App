import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { freezeAssignmentGradePolicy, type AssignmentGradePolicy } from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';
import { authorizeGradebookActor } from './gradebook-authorization.js';
import { GradebookAccessError, GradebookConflictError, type GradebookPrincipal } from './gradebook.repository.js';
import type {
  AssignmentGradeReleasePreview, AssignmentGradeReleaseReceipt, ClassResultTarget, ClassResultsSharingReceipt,
  GradeReleaseAssignment, GradeReleaseContent, GradeReleaseResponse, GradeReleaseResponseDetail, GradeReleaseRosterRow,
  GradeReleaseTarget, PublishAssignmentGradesInput, PublishClassResultsInput, RevokeClassResultsInput,
  SharedAssignmentResults, SharedClassAssignments, SharedGradeResponseDetail,
} from './class-grade-release.types.js';

export class GradeReleaseValidationError extends Error {
  constructor(message = 'Choose a valid class, assignment and reviewed grade targets.') { super(message); this.name = 'GradeReleaseValidationError'; }
}
export const CLASS_GRADE_RELEASE_TARGET_LIMIT = 500;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: string): string => { if (typeof value !== 'string' || !uuidPattern.test(value)) throw new GradeReleaseValidationError(); return value.toLowerCase(); };
const text = (value: string, maximum: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new GradeReleaseValidationError();
  return value;
};
const sequence = (value: number): number => { if (!Number.isSafeInteger(value) || value < 0 || value >= 2_147_483_647) throw new GradeReleaseValidationError(); return value; };
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: Date): string => value.toISOString();
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown): string => typeof value === 'string' ? value : '';

type Scope = {
  class_id: string; class_name: string; archived_at: Date | null; assignment_id: string; title: string; instructions: string;
  due_on: string | null; policy_id: string; policy: AssignmentGradePolicy; closes_at: Date | null;
  content_snapshot: Record<string, unknown>; quiz_snapshot: unknown | null; written_prompt: string | null;
};
type Fact = {
  learner_id: string; display_name: string; email: string | null; included: boolean; recipient_id: string | null;
  applicability: string | null; attempt_id: string | null; attempt_sequence: number | null; submitted_at: Date | null;
  grade_id: string | null; grade_kind: string | null; grade_attempt_id: string | null; earned_units: string | null;
  publication_id: string | null; publication_grade_id: string | null; publication_sequence: number | null;
  dispute_status: string | null; dispute_outcome: string | null; dispute_grade_revision_id: string | null;
  verification_status: string | null;
};
type EventRow = { id: string; sequence: number; class_id: string; assignment_id: string; shared: boolean; recipient_count: number; created_at: Date };
type BatchRow = { id: string; class_id: string; assignment_id: string; actor_id: string; fingerprint: string; created_at: Date };

function targets<T extends GradeReleaseTarget | ClassResultTarget>(value: readonly T[], shared: boolean): T[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > CLASS_GRADE_RELEASE_TARGET_LIMIT) throw new GradeReleaseValidationError('Review between 1 and 500 distinct learners per command.');
  const normalized = value.map(item => {
    if (!item || typeof item !== 'object') throw new GradeReleaseValidationError();
    return shared
      ? { recipientId: id(item.recipientId), gradeRevisionId: id(item.gradeRevisionId), publicationId: id((item as ClassResultTarget).publicationId),
        attemptId: (item as ClassResultTarget).attemptId === null ? null : id((item as ClassResultTarget).attemptId!) }
      : { recipientId: id(item.recipientId), gradeRevisionId: id(item.gradeRevisionId), expectedPublicationSequence: sequence((item as GradeReleaseTarget).expectedPublicationSequence) };
  }) as T[];
  if (new Set(normalized.map(item => item.recipientId)).size !== normalized.length) throw new GradeReleaseValidationError('Choose each learner only once.');
  return normalized.sort((a, b) => a.recipientId.localeCompare(b.recipientId));
}

function assignment(scope: Scope): GradeReleaseAssignment {
  return { id: scope.assignment_id, title: scope.title, kind: scope.written_prompt !== null ? 'written' : scope.policy.scoring.mode === 'multiple_choice' ? 'quiz' : 'problem',
    instructions: scope.instructions, dueOn: scope.due_on, closesAt: scope.closes_at ? iso(scope.closes_at) : null,
    maxUnits: scope.policy.maxUnits, policyVersionId: scope.policy_id };
}
function content(scope: Scope): GradeReleaseContent {
  if (scope.written_prompt !== null) return { prompt: scope.written_prompt, questions: [] };
  if (scope.policy.scoring.mode === 'multiple_choice') {
    const snapshot = record(scope.quiz_snapshot);
    if (!Array.isArray(snapshot.questions)) throw new Error('Frozen quiz questions are unavailable');
    return { prompt: '', questions: snapshot.questions.map(item => {
      const entry = record(item), question = record(entry.question);
      return { id: string(question.versionId), title: string(question.title), prompt: string(question.prompt),
        options: Array.isArray(question.options) ? question.options.map(option => ({ id: string(record(option).id), text: string(record(option).text) })) : [],
        maxUnits: typeof entry.maxUnits === 'number' ? entry.maxUnits : null };
    }) };
  }
  // Only the pinned learner-facing prompt, never solution_code/test_cases or today's catalog.
  return { prompt: string(scope.content_snapshot.markdown_content) || string(scope.content_snapshot.description), questions: [] };
}
const sharingReceipt = (row: EventRow): ClassResultsSharingReceipt => ({ id: row.id, sequence: row.sequence,
  classId: row.class_id, assignmentId: row.assignment_id, shared: row.shared, recipientCount: row.recipient_count, createdAt: iso(row.created_at) });

/** Explicit grade release and named class sharing; browser database roles retain no table access. */
export class PostgresClassGradeReleaseRepository {
  private readonly principal: GradebookPrincipal;
  constructor(private readonly db: DatabaseClient, principal: GradebookPrincipal) {
    if (!principal || !['instructor','administrator','learner'].includes(principal.role)) throw new GradebookAccessError();
    this.principal = Object.freeze({ role: principal.role, userId: id(principal.userId) });
  }
  private staff(): void { if (this.principal.role === 'learner') throw new GradebookAccessError(); }
  private learner(): void { if (this.principal.role !== 'learner') throw new GradebookAccessError(); }

  private async classroom(client: PoolClient, classId: string, lock = false): Promise<{ id: string; name: string; archived_at: Date | null }> {
    await authorizeGradebookActor(client, this.principal, lock);
    const result = await client.query<{ id: string; name: string; archived_at: Date | null }>(`SELECT c.id,c.name,c.archived_at FROM classrooms c
      WHERE c.id=$1 AND CASE WHEN $2='administrator' THEN true WHEN $2='instructor' THEN c.created_by=$3::uuid
        ELSE c.archived_at IS NULL AND EXISTS(SELECT 1 FROM class_enrollments e WHERE e.class_id=c.id AND e.user_id=$3::uuid) END
      ${lock ? 'FOR SHARE OF c' : ''}`, [classId, this.principal.role, this.principal.userId]);
    if (!result.rows[0]) throw new GradebookAccessError();
    return result.rows[0];
  }
  private async scope(client: PoolClient, classId: string, assignmentId: string, lock = false): Promise<Scope> {
    const classroom = await this.classroom(client, classId, lock);
    const result = await client.query<Omit<Scope, 'class_name' | 'archived_at'>>(`SELECT a.class_id,a.id AS assignment_id,
      COALESCE(w.title,q.title,a.title) AS title,COALESCE(w.instructions,q.instructions,a.instructions) AS instructions,
      to_char(a.due_on,'YYYY-MM-DD') AS due_on,p.id AS policy_id,p.policy,p.closes_at,p.content_snapshot,
      q.snapshot AS quiz_snapshot,w.prompt AS written_prompt
      FROM class_assignments a JOIN gradebook_policies p ON p.assignment_id=a.id
      LEFT JOIN quiz_publications q ON q.policy_id=p.id LEFT JOIN written_assessment_publications w ON w.policy_id=p.id
      WHERE a.id=$1 AND a.class_id=$2 ${lock ? 'FOR SHARE OF a,p' : ''}`, [assignmentId,classId]);
    if (!result.rows[0]) throw new GradebookAccessError();
    const row = result.rows[0];
    return { ...row, policy: freezeAssignmentGradePolicy(row.policy), class_name: classroom.name, archived_at: classroom.archived_at };
  }
  private async facts(client: PoolClient, scope: Scope): Promise<Fact[]> {
    return (await client.query<Fact>(`WITH cohort AS (
      SELECT e.user_id AS learner_id,true AS included FROM class_enrollments e WHERE e.class_id=$1
      UNION ALL SELECT r.learner_id,false FROM gradebook_recipients r WHERE r.policy_id=$2
        AND NOT EXISTS(SELECT 1 FROM class_enrollments e WHERE e.class_id=$1 AND e.user_id=r.learner_id)
    ) SELECT cohort.learner_id,u.display_name,u.email,cohort.included,r.id AS recipient_id,
      ar.applicability,at.id AS attempt_id,at.sequence AS attempt_sequence,at.submitted_at,
      g.id AS grade_id,g.kind AS grade_kind,g.attempt_id AS grade_attempt_id,g.earned_units,
      pub.id AS publication_id,pub.grade_revision_id AS publication_grade_id,pub.sequence AS publication_sequence,
      de.status AS dispute_status,de.outcome AS dispute_outcome,de.grade_revision_id AS dispute_grade_revision_id,
      v.status AS verification_status
      FROM cohort JOIN users u ON u.id=cohort.learner_id LEFT JOIN gradebook_recipients r ON r.learner_id=cohort.learner_id AND r.policy_id=$2
      LEFT JOIN LATERAL(SELECT * FROM gradebook_applicability_revisions WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) ar ON true
      LEFT JOIN LATERAL(SELECT id,sequence,submitted_at FROM gradebook_attempts WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) at ON true
      LEFT JOIN LATERAL(SELECT id,kind,attempt_id,earned_units FROM gradebook_grade_revisions WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) g ON true
      LEFT JOIN LATERAL(SELECT id,grade_revision_id,sequence FROM gradebook_publications WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) pub ON true
      LEFT JOIN LATERAL(SELECT status,outcome,grade_revision_id FROM gradebook_dispute_events WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) de ON true
      LEFT JOIN gradebook_verification_jobs v ON v.attempt_id=at.id
      ORDER BY lower(u.display_name),u.display_name,u.id`, [scope.class_id,scope.policy_id])).rows;
  }
  private row(scope: Scope, fact: Fact): GradeReleaseRosterRow {
    const currentGrade = fact.grade_id !== null && fact.grade_attempt_id === fact.attempt_id
      && (fact.attempt_id !== null || fact.grade_kind === 'missing_zero');
    const disputed = ['submitted','in_review'].includes(fact.dispute_status ?? '')
      || (fact.dispute_status === 'resolved' && fact.dispute_outcome === 'changed' && fact.dispute_grade_revision_id === fact.grade_id);
    const published = currentGrade && fact.publication_grade_id === fact.grade_id;
    const earned = currentGrade && fact.earned_units !== null ? Number(fact.earned_units) : null;
    if (earned !== null && (!Number.isSafeInteger(earned) || earned < 0 || earned > scope.policy.maxUnits)) throw new Error('Stored grade points are invalid');
    const state = !fact.recipient_id ? 'not_assigned' : fact.applicability === 'excused' ? 'excused'
      : currentGrade ? published ? 'published' : 'draft' : !fact.attempt_id ? 'unsubmitted'
      : scope.policy.scoring.mode === 'reviewed_rubric' ? 'needs_review'
      : fact.verification_status === 'queued' ? 'queued' : fact.verification_status === 'running' ? 'running' : 'unavailable';
    const reason = scope.archived_at ? 'Class archived' : !fact.included ? 'Learner withdrawn' : state === 'not_assigned' ? 'Not assigned'
      : state === 'excused' ? 'Learner excused' : disputed ? 'Grade review is open or unresolved' : published ? 'Already released'
      : !currentGrade ? fact.grade_id ? 'Latest response needs a new grade' : 'No saved grade to release' : null;
    const ready = reason === null;
    const shareable = !scope.archived_at && fact.included && fact.applicability === 'assigned' && published && !disputed;
    return { learner: { id: fact.learner_id, displayName: fact.display_name, email: fact.email }, membership: fact.included ? 'included' : 'withdrawn',
      recipientId: fact.recipient_id, state, earnedUnits: ['draft','published'].includes(state) ? earned : null, maxUnits: scope.policy.maxUnits,
      ready, reason, releaseTarget: ready ? { recipientId: fact.recipient_id!, gradeRevisionId: fact.grade_id!, expectedPublicationSequence: fact.publication_sequence ?? 0 } : null,
      shareTarget: shareable ? { recipientId: fact.recipient_id!, gradeRevisionId: fact.grade_id!, publicationId: fact.publication_id!, attemptId: fact.attempt_id } : null,
      response: fact.attempt_id ? { attemptId: fact.attempt_id, sequence: fact.attempt_sequence!, submittedAt: iso(fact.submitted_at!), text: null, language: null, answers: {} } : null };
  }
  private async latestSharing(client: PoolClient, assignmentId: string): Promise<EventRow | null> {
    return (await client.query<EventRow>('SELECT * FROM gradebook_class_result_events WHERE assignment_id=$1 ORDER BY sequence DESC LIMIT 1', [assignmentId])).rows[0] ?? null;
  }
  private async response(client: PoolClient, recipientId: string, attemptId: string | null): Promise<GradeReleaseResponse | null> {
    if (!attemptId) return null;
    const row = (await client.query<{ id: string; sequence: number; submitted_at: Date; response: unknown }>(
      'SELECT id,sequence,submitted_at,response FROM gradebook_attempts WHERE id=$1 AND recipient_id=$2', [attemptId,recipientId])).rows[0];
    if (!row) throw new GradebookAccessError();
    const source = record(row.response), answers: Record<string,string | null> = {};
    if (source.kind === 'multiple_choice') for (const [key,value] of Object.entries(record(source.answers))) {
      if (typeof value === 'string' || value === null) answers[key] = value;
    }
    return { attemptId: row.id, sequence: row.sequence, submittedAt: iso(row.submitted_at),
      text: typeof source.text === 'string' ? source.text : null, language: typeof source.language === 'string' ? source.language : null, answers };
  }
  private async audit(client: PoolClient, action: string, targetId: string, reason: string, scope: Scope): Promise<void> {
    await client.query(`INSERT INTO administration_audit_events(actor_id,action,target_type,target_id,reason,metadata)
      VALUES($1,$2,'gradebook',$3,$4,$5)`, [this.principal.userId,action,targetId,reason,{ classId: scope.class_id, assignmentId: scope.assignment_id }]);
  }
  private async lockCommand(client: PoolClient, classId: string, assignmentId: string, recipientIds: string[], requestKey: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`class-grade-command:${this.principal.userId}:${requestKey}`]);
    // Account deletion cascades into recipients/enrollments. Acquire parents in the same order as individual grading.
    await client.query(`SELECT u.id FROM users u WHERE u.id=$1 OR u.id IN(SELECT r.learner_id FROM gradebook_recipients r
      JOIN gradebook_policies p ON p.id=r.policy_id JOIN class_assignments a ON a.id=p.assignment_id
      WHERE r.id=ANY($2::uuid[]) AND a.class_id=$3 AND a.id=$4) ORDER BY u.id FOR SHARE OF u`,
    [this.principal.userId,recipientIds,classId,assignmentId]);
  }
  private async lockRecipients(client: PoolClient, scope: Scope, recipientIds: string[]): Promise<void> {
    const recipients = await client.query<{ learner_id: string }>(`SELECT learner_id FROM gradebook_recipients
      WHERE policy_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`, [scope.policy_id,recipientIds]);
    if (recipients.rows.length !== recipientIds.length) throw new GradebookConflictError();
    const enrolled = await client.query('SELECT user_id FROM class_enrollments WHERE class_id=$1 AND user_id=ANY($2::uuid[]) ORDER BY user_id FOR SHARE',
      [scope.class_id,recipients.rows.map(row => row.learner_id)]);
    if (enrolled.rows.length !== recipientIds.length) throw new GradebookConflictError();
  }

  async readAssignment(classId: string, assignmentId: string): Promise<AssignmentGradeReleasePreview> {
    this.staff(); id(classId); id(assignmentId);
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const scope = await this.scope(client,classId,assignmentId);
      const sharing = await this.latestSharing(client,assignmentId);
      return { classroom: { id: classId,name: scope.class_name }, assignment: assignment(scope), archived: Boolean(scope.archived_at),
        content: content(scope), roster: (await this.facts(client,scope)).map(fact => this.row(scope,fact)), sharing: sharing ? sharingReceipt(sharing) : null };
    });
  }
  async readResponseDetail(classId: string, recipientId: string): Promise<GradeReleaseResponseDetail> {
    this.staff(); id(classId); id(recipientId);
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const identity = (await client.query<{ assignment_id: string }>(`SELECT p.assignment_id FROM gradebook_recipients r
        JOIN gradebook_policies p ON p.id=r.policy_id JOIN class_assignments a ON a.id=p.assignment_id WHERE r.id=$1 AND a.class_id=$2`, [recipientId,classId])).rows[0];
      if (!identity) throw new GradebookAccessError();
      const scope = await this.scope(client,classId,identity.assignment_id);
      const fact = (await this.facts(client,scope)).find(row => row.recipient_id === recipientId);
      if (!fact) throw new GradebookAccessError();
      const view = this.row(scope,fact);
      const grade = fact.grade_id && fact.grade_attempt_id === fact.attempt_id ? (await client.query<{
        id: string; earned_units: string; criterion_scores: Record<string,number>; learner_feedback: string;
      }>('SELECT id,earned_units,criterion_scores,learner_feedback FROM gradebook_grade_revisions WHERE id=$1', [fact.grade_id])).rows[0] : null;
      return { classroom: { id: classId,name: scope.class_name }, assignment: assignment(scope), content: content(scope), learner: view.learner,
        recipientId, response: await this.response(client,recipientId,fact.attempt_id), state: view.state,
        grade: grade ? { id: grade.id, earnedUnits: Number(grade.earned_units), maxUnits: scope.policy.maxUnits, criterionScores: grade.criterion_scores,
          learnerFeedback: grade.learner_feedback, published: view.state === 'published', publicationSequence: fact.publication_sequence ?? 0 } : null,
        releaseTarget: view.releaseTarget };
    });
  }

  private async batchReceipt(client: PoolClient, batch: BatchRow, selected: readonly GradeReleaseTarget[]): Promise<AssignmentGradeReleaseReceipt> {
    const items = await client.query<{ recipient_id: string; id: string; sequence: number; grade_revision_id: string; created_at: Date }>(`SELECT i.recipient_id,p.id,p.sequence,p.grade_revision_id,p.created_at
      FROM gradebook_release_batch_items i JOIN gradebook_publications p ON p.id=i.publication_id WHERE i.batch_id=$1 ORDER BY i.recipient_id`, [batch.id]);
    if (items.rows.length !== selected.length || selected.some(target => !items.rows.some(row => row.recipient_id === target.recipientId
      && row.grade_revision_id === target.gradeRevisionId && row.sequence === target.expectedPublicationSequence + 1))) throw new GradebookAccessError();
    return { id: batch.id,classId: batch.class_id,assignmentId: batch.assignment_id,actorId: batch.actor_id,createdAt: iso(batch.created_at),
      publications: items.rows.map(row => ({ recipientId: row.recipient_id,publication: { id: row.id,sequence: row.sequence,gradeRevisionId: row.grade_revision_id,publishedAt: iso(row.created_at) } })) };
  }
  async publishAssignmentGrades(input: PublishAssignmentGradesInput): Promise<AssignmentGradeReleaseReceipt> {
    this.staff(); const classId = id(input.classId), assignmentId = id(input.assignmentId);
    const selected = targets(input.targets,false), requestKey = text(input.requestKey,128), reason = text(input.reason,4000);
    const fingerprint = hash({ operation: 'release',classId,assignmentId,targets: selected,reason });
    return this.db.transaction(async client => {
      await this.lockCommand(client,classId,assignmentId,selected.map(item => item.recipientId),requestKey);
      const scope = await this.scope(client,classId,assignmentId,true);
      const prior = (await client.query<BatchRow>('SELECT * FROM gradebook_release_batches WHERE actor_id=$1 AND request_key=$2', [this.principal.userId,requestKey])).rows[0];
      if (prior) { if (prior.fingerprint !== fingerprint) throw new GradebookConflictError(); return this.batchReceipt(client,prior,selected); }
      if (scope.archived_at) throw new GradebookAccessError();
      await this.lockRecipients(client,scope,selected.map(item => item.recipientId));
      const facts = await this.facts(client,scope);
      for (const target of selected) {
        const fact = facts.find(row => row.recipient_id === target.recipientId);
        if (!fact || JSON.stringify(this.row(scope,fact).releaseTarget) !== JSON.stringify(target)) throw new GradebookConflictError();
      }
      const batch = (await client.query<BatchRow>(`INSERT INTO gradebook_release_batches(class_id,assignment_id,actor_id,request_key,fingerprint)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [classId,assignmentId,this.principal.userId,requestKey,fingerprint])).rows[0];
      for (const target of selected) {
        const publication = (await client.query<{ id: string }>(`INSERT INTO gradebook_publications(recipient_id,policy_id,grade_revision_id,sequence,reason,published_by,request_key)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [target.recipientId,scope.policy_id,target.gradeRevisionId,target.expectedPublicationSequence + 1,
          reason,this.principal.userId,`class-batch:${batch.id}`])).rows[0];
        await client.query('INSERT INTO gradebook_release_batch_items(batch_id,recipient_id,publication_id) VALUES($1,$2,$3)', [batch.id,target.recipientId,publication.id]);
        await this.audit(client,'gradebook.grade.publish',publication.id,reason,scope);
      }
      await this.audit(client,'gradebook.assignment.release',batch.id,reason,scope);
      return this.batchReceipt(client,batch,selected);
    });
  }

  async publishClassResults(input: PublishClassResultsInput): Promise<ClassResultsSharingReceipt> {
    this.staff(); return this.changeSharing(input,targets(input.targets,true));
  }
  async revokeClassResults(input: RevokeClassResultsInput): Promise<ClassResultsSharingReceipt> {
    this.staff(); return this.changeSharing(input,null);
  }
  private async changeSharing(input: RevokeClassResultsInput, selected: ClassResultTarget[] | null): Promise<ClassResultsSharingReceipt> {
    const classId = id(input.classId), assignmentId = id(input.assignmentId), requestKey = text(input.requestKey,128), reason = text(input.reason,4000);
    const expected = sequence(input.expectedSharingSequence);
    const fingerprint = hash({ operation: selected ? 'share' : 'revoke',classId,assignmentId,expectedSharingSequence: expected,targets: selected,reason });
    return this.db.transaction(async client => {
      await this.lockCommand(client,classId,assignmentId,selected?.map(item => item.recipientId) ?? [],requestKey);
      const scope = await this.scope(client,classId,assignmentId,true);
      // One current sharing event per assignment. Role/account locks precede this child lock.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`class-results:${assignmentId}`]);
      const prior = (await client.query<EventRow & { fingerprint: string }>(`SELECT e.*,c.fingerprint FROM gradebook_class_result_commands c
        JOIN gradebook_class_result_events e ON e.id=c.event_id WHERE c.actor_id=$1 AND c.request_key=$2`, [this.principal.userId,requestKey])).rows[0];
      if (prior) { if (prior.fingerprint !== fingerprint) throw new GradebookConflictError(); return sharingReceipt(prior); }
      if (scope.archived_at) throw new GradebookAccessError();
      const current = await this.latestSharing(client,assignmentId);
      if ((current?.sequence ?? 0) !== expected) throw new GradebookConflictError();
      if (!selected && !current?.shared) throw new GradebookConflictError();
      if (selected) {
        await this.lockRecipients(client,scope,selected.map(item => item.recipientId));
        const facts = await this.facts(client,scope);
        for (const target of selected) {
          const fact = facts.find(row => row.recipient_id === target.recipientId);
          if (!fact || JSON.stringify(this.row(scope,fact).shareTarget) !== JSON.stringify(target)) throw new GradebookConflictError();
        }
      }
      const event = (await client.query<EventRow>(`INSERT INTO gradebook_class_result_events(class_id,assignment_id,sequence,shared,recipient_count)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [classId,assignmentId,expected+1,selected !== null,selected?.length ?? 0])).rows[0];
      for (const target of selected ?? []) await client.query(`INSERT INTO gradebook_class_result_targets(event_id,recipient_id,grade_revision_id,publication_id,attempt_id)
        VALUES($1,$2,$3,$4,$5)`, [event.id,target.recipientId,target.gradeRevisionId,target.publicationId,target.attemptId]);
      await client.query('INSERT INTO gradebook_class_result_commands(actor_id,request_key,event_id,fingerprint) VALUES($1,$2,$3,$4)', [this.principal.userId,requestKey,event.id,fingerprint]);
      await this.audit(client,selected ? 'gradebook.class_results.publish' : 'gradebook.class_results.revoke',event.id,reason,scope);
      return sharingReceipt(event);
    });
  }

  private async sharedRows(client: PoolClient, scope: Scope, event: EventRow): Promise<GradeReleaseRosterRow[]> {
    const selected = (await client.query<{ recipient_id: string; grade_revision_id: string; publication_id: string; attempt_id: string | null }>(
      'SELECT recipient_id,grade_revision_id,publication_id,attempt_id FROM gradebook_class_result_targets WHERE event_id=$1', [event.id])).rows;
    // Current grades/attempts and membership must still match the pinned disclosure.
    return (await this.facts(client,scope)).map(fact => this.row(scope,fact)).filter(row => row.shareTarget && selected.some(target =>
      target.recipient_id === row.shareTarget!.recipientId && target.grade_revision_id === row.shareTarget!.gradeRevisionId
      && target.publication_id === row.shareTarget!.publicationId && target.attempt_id === row.shareTarget!.attemptId));
  }
  async listSharedAssignments(classId: string): Promise<SharedClassAssignments> {
    this.learner(); id(classId);
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const classroom = await this.classroom(client,classId);
      const rows = await client.query<{ id: string; title: string; kind: GradeReleaseAssignment['kind']; max_units: string; created_at: Date; recipient_count: number }>(`SELECT a.id,COALESCE(w.title,q.title,a.title) AS title,
        CASE WHEN w.id IS NOT NULL THEN 'written' WHEN p.policy->'scoring'->>'mode'='multiple_choice' THEN 'quiz' ELSE 'problem' END AS kind,
        p.policy->>'maxUnits' AS max_units,e.created_at,e.recipient_count FROM class_assignments a
        JOIN gradebook_policies p ON p.assignment_id=a.id
        JOIN LATERAL(SELECT * FROM gradebook_class_result_events WHERE assignment_id=a.id ORDER BY sequence DESC LIMIT 1) e ON e.shared
        LEFT JOIN quiz_publications q ON q.policy_id=p.id LEFT JOIN written_assessment_publications w ON w.policy_id=p.id
        WHERE a.class_id=$1 ORDER BY e.created_at DESC,a.id`, [classId]);
      return { classroom: { id: classroom.id,name: classroom.name },assignments: rows.rows.map(row => ({ id: row.id,title: row.title,kind: row.kind,
        maxUnits: Number(row.max_units),sharedAt: iso(row.created_at),recipientCount: row.recipient_count })) };
    });
  }
  async readSharedAssignment(classId: string, assignmentId: string): Promise<SharedAssignmentResults> {
    this.learner(); id(classId); id(assignmentId);
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const scope = await this.scope(client,classId,assignmentId), event = await this.latestSharing(client,assignmentId);
      if (!event?.shared) throw new GradebookAccessError();
      return { classroom: { id: classId,name: scope.class_name },assignment: assignment(scope),content: content(scope),sharing: sharingReceipt(event),
        learners: (await this.sharedRows(client,scope,event)).map(row => ({ learner: { id: row.learner.id,displayName: row.learner.displayName },
          recipientId: row.recipientId!,earnedUnits: row.earnedUnits!,maxUnits: row.maxUnits,response: row.response })) };
    });
  }
  async readSharedResponseDetail(classId: string, assignmentId: string, recipientId: string): Promise<SharedGradeResponseDetail> {
    this.learner(); id(classId); id(assignmentId); id(recipientId);
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const scope = await this.scope(client,classId,assignmentId), event = await this.latestSharing(client,assignmentId);
      if (!event?.shared) throw new GradebookAccessError();
      const row = (await this.sharedRows(client,scope,event)).find(item => item.recipientId === recipientId);
      if (!row) throw new GradebookAccessError();
      return { classroom: { id: classId,name: scope.class_name },assignment: assignment(scope),content: content(scope),
        sharing: sharingReceipt(event),
        learner: { id: row.learner.id,displayName: row.learner.displayName },recipientId,
        response: await this.response(client,recipientId,row.shareTarget!.attemptId),earnedUnits: row.earnedUnits!,maxUnits: row.maxUnits };
    });
  }
}

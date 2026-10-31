import type { PoolClient } from 'pg';
import { buildClassInsights, canPerformAdministrationAction, type AdministrationRole, type ClassInsightObservation, type ClassInsightsReport } from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';

export class ClassInsightsAccessError extends Error {
  constructor() { super('Class insights are unavailable for this account.'); this.name = 'ClassInsightsAccessError'; }
}
export type ClassInsightsPrincipal = { role: 'instructor' | 'administrator'; userId: string; conceptIds: readonly string[] };
export type ClassInsightsData = { report: ClassInsightsReport; assignedQuestionIds: string[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read-only class assessment aggregates. Personal practice and diagnostics are never queried. */
export class PostgresClassInsightsRepository {
  constructor(private readonly db: DatabaseClient, private readonly principal: ClassInsightsPrincipal) {}

  private async authorizeClass(client: PoolClient, classId: string): Promise<{ id: string; name: string }> {
    if (!this.principal || !uuid.test(this.principal.userId) || !uuid.test(classId)
      || !['instructor', 'administrator'].includes(this.principal.role)) throw new ClassInsightsAccessError();
    const actor = (await client.query<{ role: string }>('SELECT role FROM users WHERE id=$1 FOR SHARE', [this.principal.userId])).rows[0];
    if (!actor) throw new ClassInsightsAccessError();
    if (this.principal.role === 'administrator') {
      const roles = await client.query<{ role: AdministrationRole }>('SELECT role FROM administration_role_assignments WHERE user_id=$1 AND revoked_at IS NULL FOR SHARE', [this.principal.userId]);
      if (!canPerformAdministrationAction(roles.rows.map(row => row.role), 'classes.insights.read')) throw new ClassInsightsAccessError();
    } else if (!['instructor', 'admin'].includes(actor.role)) throw new ClassInsightsAccessError();
    const classroom = (await client.query<{ id: string; name: string }>(`SELECT id,name FROM classrooms WHERE id=$1 AND archived_at IS NULL
      AND ($2::boolean OR created_by=$3) FOR SHARE`, [classId, this.principal.role === 'administrator', this.principal.userId])).rows[0];
    if (!classroom) throw new ClassInsightsAccessError();
    return { id: classroom.id, name: classroom.name };
  }

  async readClassroom(classId: string): Promise<{ id: string; name: string }> {
    return this.db.transaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      return this.authorizeClass(client, classId);
    });
  }

  async read(classId: string): Promise<ClassInsightsData> {
    return this.db.transaction(async client => {
      // The roster, current releases and assignment exclusion pool share one snapshot.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      const classroom = await this.authorizeClass(client, classId);
      const facts = (await client.query<{
        generated_at: string; roster_count: number; observations: ClassInsightObservation[]; assigned_question_ids: string[];
      }>(`
        WITH roster AS MATERIALIZED (SELECT user_id FROM class_enrollments WHERE class_id=$1),
        eligible AS MATERIALIZED (
          SELECT r.learner_id,t.submitted_at,p.created_at AS published_at,p.id AS source_id,t.response,q.snapshot
          FROM gradebook_recipients r
          JOIN roster current_roster ON current_roster.user_id=r.learner_id
          JOIN LATERAL (SELECT * FROM gradebook_publications WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) p ON true
          JOIN gradebook_grade_revisions g ON g.id=p.grade_revision_id AND g.recipient_id=r.id AND g.policy_id=r.policy_id AND g.kind='scored'
          JOIN quiz_score_evidence e ON e.id=g.quiz_score_id AND e.recipient_id=r.id AND e.attempt_id=g.attempt_id AND e.policy_id=r.policy_id
          JOIN gradebook_attempts t ON t.id=g.attempt_id AND t.recipient_id=r.id AND t.policy_id=r.policy_id
          JOIN quiz_publications q ON q.id=e.publication_id AND q.policy_id=r.policy_id AND q.class_id=$1
          JOIN LATERAL (SELECT applicability FROM gradebook_applicability_revisions WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) a ON a.applicability='assigned'
          LEFT JOIN LATERAL (SELECT * FROM gradebook_dispute_events WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) d ON true
          WHERE e.scoring_version='multiple-choice-v1' AND e.snapshot_hash=q.snapshot_hash
            AND g.evaluator_version_id=e.scoring_version AND g.earned_units=e.earned_units
            AND q.snapshot->>'scoringVersion'='multiple-choice-v1'
            AND t.response->>'kind'='multiple_choice'
            AND e.response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex')
            AND NOT COALESCE(d.status IN('submitted','in_review'),false)
            AND NOT COALESCE(d.status='resolved' AND d.outcome='changed' AND d.grade_revision_id=g.id,false)
        ), answered AS (
          SELECT e.learner_id,e.submitted_at,e.published_at,e.source_id,q.value->'question'->>'questionId' AS question_id,
            q.value->'question'->'conceptIds' AS concept_ids,
            (e.response->'answers'->>(q.value->'question'->>'versionId')=q.value->'question'->>'correctOptionId') AS correct
          FROM eligible e CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'questions') q
          WHERE e.response->'answers'->>(q.value->'question'->>'versionId') IS NOT NULL
        ), latest AS (
          SELECT DISTINCT ON(learner_id,question_id) * FROM answered
          ORDER BY learner_id,question_id,submitted_at DESC,published_at DESC,source_id DESC
        )
        SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS generated_at,
          (SELECT count(*)::integer FROM roster) AS roster_count,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('learnerId',learner_id,'questionId',question_id,'conceptIds',concept_ids,
            'correct',correct,'occurredAt',to_char(submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceId',source_id)
            ORDER BY learner_id,question_id) FROM latest),'[]'::jsonb) AS observations,
          COALESCE((SELECT jsonb_agg(question_id ORDER BY question_id) FROM (
            SELECT DISTINCT q.value->'question'->>'questionId' AS question_id FROM quiz_publications p
            CROSS JOIN LATERAL jsonb_array_elements(p.snapshot->'questions') q WHERE p.class_id=$1
          ) assigned),'[]'::jsonb) AS assigned_question_ids
      `, [classId])).rows[0];
      return {
        report: buildClassInsights({ classroom, generatedAt: facts.generated_at,
          view: this.principal.role === 'administrator' ? 'administrator' : 'owner', rosterCount: facts.roster_count,
          conceptIds: this.principal.conceptIds, observations: facts.observations }),
        assignedQuestionIds: [...facts.assigned_question_ids],
      };
    });
  }
}

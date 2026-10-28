import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { estimateLearningConcepts, LEARNING_ALGORITHM_VERSION, type LearningConceptEstimate, type LearningEvidenceSnapshot, type LearningObservation, type LearningPracticeDescriptor } from '@leetcode-app/domain';
import type { DatabaseClient } from '../client.js';

export class LearningEvidenceAccessError extends Error {}
export class LearningEvidenceConflictError extends Error {}
export class LearningEvidenceValidationError extends Error {}
export type LearningReviewReceipt = { conceptId: string; requestKey: string; previousRevision: number; revision: number; dueAt: string };
type Principal = { userId: string; practiceCatalog: readonly LearningPracticeDescriptor[]; practiceGradeVersion: string };
type Work = { source_kind: 'quiz' | 'practice'; source_id: string; revision: string };
type StoredSource = { source_kind: 'quiz' | 'practice'; source_id: string; observations: LearningObservation[] };
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: string | Date) => new Date(value).toISOString();

// Always resolve the current authoritative release. An unpublished correction does not
// replace a released grade, while an active/changed dispute suspends its old evidence.
const eligibleQuiz = `
  SELECT p.id::text AS source_revision,t.submitted_at AS released_at,q.snapshot,e.result
  FROM gradebook_recipients r
  JOIN LATERAL (SELECT * FROM gradebook_publications WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) p ON true
  JOIN gradebook_grade_revisions g ON g.id=p.grade_revision_id AND g.recipient_id=r.id
  JOIN quiz_score_evidence e ON e.id=g.quiz_score_id AND e.recipient_id=r.id AND e.attempt_id=g.attempt_id
  JOIN gradebook_attempts t ON t.id=g.attempt_id AND t.recipient_id=r.id
  JOIN quiz_publications q ON q.id=e.publication_id AND q.policy_id=r.policy_id
  JOIN LATERAL (SELECT applicability FROM gradebook_applicability_revisions WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) a ON a.applicability='assigned'
  LEFT JOIN LATERAL (SELECT * FROM gradebook_dispute_events WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1) d ON true
  WHERE r.learner_id=$1 AND r.id=$2 AND g.kind='scored'
    AND e.scoring_version='multiple-choice-v1' AND e.snapshot_hash=q.snapshot_hash
    AND NOT (COALESCE(d.status IN ('submitted','in_review'),false))
    AND NOT (COALESCE(d.status='resolved' AND d.outcome='changed' AND d.grade_revision_id=g.id,false))`;

export class PostgresLearningEvidenceRepository {
  private readonly catalog: ReadonlyMap<string, LearningPracticeDescriptor>;
  constructor(private readonly db: DatabaseClient, private readonly principal: Principal) {
    this.catalog = new Map(principal.practiceCatalog.filter(item => item.contentId).map(item => [item.contentId!, item]));
  }

  private async lock(client: PoolClient): Promise<void> {
    const owner = await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [this.principal.userId]);
    if (!owner.rowCount) throw new LearningEvidenceAccessError('Learner account not found');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('learning-evidence:' || $1,0))", [this.principal.userId]);
  }

  async readSnapshot(): Promise<LearningEvidenceSnapshot> {
    return this.db.transaction(async client => { await this.lock(client); return this.refresh(client); });
  }

  async snoozeReview(input: { conceptId: string; expectedRevision: number; days: 1 | 3 | 7; requestKey: string }): Promise<{ snapshot: LearningEvidenceSnapshot; receipt: LearningReviewReceipt }> {
    if (!input.conceptId || input.conceptId.length > 200 || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || ![1,3,7].includes(input.days) || !input.requestKey.trim() || input.requestKey.length > 128) throw new LearningEvidenceValidationError('Invalid review request');
    return this.db.transaction(async client => {
      await this.lock(client);
      const snapshot = await this.refresh(client);
      const expected = fingerprint([input.conceptId,input.expectedRevision,input.days,input.requestKey]);
      const previous = await client.query<{ input_fingerprint: string; receipt: LearningReviewReceipt }>('SELECT input_fingerprint,receipt FROM learning_review_receipts WHERE user_id=$1 AND request_key=$2', [this.principal.userId,input.requestKey]);
      if (previous.rows[0]) {
        if (previous.rows[0].input_fingerprint !== expected) throw new LearningEvidenceConflictError('Request key already used');
        return { snapshot, receipt: previous.rows[0].receipt };
      }
      if (snapshot.optOut) throw new LearningEvidenceConflictError('Personalization is disabled');
      const nextRevision=await this.nextReviewRevision(client,input.conceptId);
      const updated = await client.query<{ review_revision: number; review_due_at: Date }>(`UPDATE learning_concept_estimates SET review_due_at=GREATEST(review_due_at,clock_timestamp())+make_interval(days=>$4),review_revision=$5
        WHERE user_id=$1 AND concept_id=$2 AND review_revision=$3 RETURNING review_revision,review_due_at`, [this.principal.userId,input.conceptId,input.expectedRevision,input.days,nextRevision]);
      if (!updated.rows[0]) throw new LearningEvidenceConflictError('Review changed; refresh and retry');
      const receipt: LearningReviewReceipt = { conceptId: input.conceptId,requestKey: input.requestKey,previousRevision: input.expectedRevision,revision: updated.rows[0].review_revision,dueAt: iso(updated.rows[0].review_due_at) };
      await client.query('INSERT INTO learning_review_receipts(user_id,request_key,input_fingerprint,receipt) VALUES($1,$2,$3,$4)', [this.principal.userId,input.requestKey,expected,receipt]);
      const concept = snapshot.concepts.find(value => value.conceptId===input.conceptId)!;
      concept.reviewDueAt=receipt.dueAt; concept.reviewRevision=receipt.revision;
      return { snapshot,receipt };
    });
  }

  private async refresh(client: PoolClient): Promise<LearningEvidenceSnapshot> {
    const userId=this.principal.userId;
    const profile=await client.query<{ personalization_opt_out: boolean }>('SELECT personalization_opt_out FROM learner_profiles WHERE user_id=$1',[userId]);
    const generatedAt=new Date().toISOString();
    if (profile.rows[0]?.personalization_opt_out) return { algorithmVersion: LEARNING_ALGORITHM_VERSION,generatedAt,optOut:true,concepts:[],recentActivityIds:[],sourceSummary:{releasedQuizItems:0,verifiedPracticeItems:0,independentItems:0},processing:{pending:false,processedSources:0,remainingSources:0} };
    // Lazy owner-only backfill. Conflicts do not increment revisions or replay work.
    await client.query(`INSERT INTO learning_evidence_work(user_id,source_kind,source_id)
      SELECT $1,discovery.source_kind,discovery.source_id FROM (
        SELECT 'quiz'::text AS source_kind,r.id AS source_id FROM gradebook_recipients r JOIN quiz_publications q ON q.policy_id=r.policy_id
        WHERE r.learner_id=$1 AND EXISTS(SELECT 1 FROM gradebook_publications p WHERE p.recipient_id=r.id)
        UNION ALL SELECT 'practice',t.session_id FROM learning_practice_reports t WHERE t.user_id=$1
      )discovery WHERE NOT EXISTS(SELECT 1 FROM learning_evidence_work w WHERE w.user_id=$1 AND w.source_kind=discovery.source_kind AND w.source_id=discovery.source_id)
      ORDER BY discovery.source_kind,discovery.source_id LIMIT 100
      ON CONFLICT(user_id,source_kind,source_id) DO NOTHING`,[userId]);
    const work=await client.query<Work>(`SELECT source_kind,source_id,revision FROM learning_evidence_work WHERE user_id=$1 AND processed_revision<revision
      ORDER BY requested_at,source_kind,source_id LIMIT 100 FOR UPDATE`,[userId]);
    for (const item of work.rows) {
      const captured=item.source_kind==='quiz' ? await this.quizObservations(client,item.source_id) : await this.practiceObservations(client,item.source_id);
      if (captured) await client.query(`INSERT INTO learning_evidence_sources(user_id,source_kind,source_id,source_revision,observations) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,source_kind,source_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,observations=EXCLUDED.observations`,[userId,item.source_kind,item.source_id,captured.revision,JSON.stringify(captured.observations)]);
      else await client.query('DELETE FROM learning_evidence_sources WHERE user_id=$1 AND source_kind=$2 AND source_id=$3',[userId,item.source_kind,item.source_id]);
      await client.query('UPDATE learning_evidence_work SET processed_revision=$4 WHERE user_id=$1 AND source_kind=$2 AND source_id=$3',[userId,item.source_kind,item.source_id,item.revision]);
    }
    // Suppress stale projections immediately, even when a bounded pump has more work.
    const sources=await client.query<StoredSource>(`SELECT s.source_kind,s.source_id,s.observations FROM learning_evidence_sources s WHERE s.user_id=$1 AND (
      (s.source_kind='practice' AND EXISTS(SELECT 1 FROM learning_practice_reports t WHERE t.session_id=s.source_id AND t.user_id=$1 AND t.request_id=s.source_revision)) OR
      (s.source_kind='quiz' AND EXISTS(SELECT 1 FROM gradebook_recipients r
        JOIN LATERAL(SELECT * FROM gradebook_publications WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1)p ON p.id::text=s.source_revision
        JOIN LATERAL(SELECT applicability FROM gradebook_applicability_revisions WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1)a ON a.applicability='assigned'
        LEFT JOIN LATERAL(SELECT * FROM gradebook_dispute_events WHERE recipient_id=r.id ORDER BY sequence DESC LIMIT 1)d ON true
        WHERE r.id=s.source_id AND r.learner_id=$1 AND NOT COALESCE(d.status IN('submitted','in_review'),false)
          AND NOT COALESCE(d.status='resolved' AND d.outcome='changed' AND d.grade_revision_id=p.grade_revision_id,false))))`,[userId]);
    const observations=sources.rows.flatMap(source=>source.observations);
    const estimates=estimateLearningConcepts(observations);
    const concepts: LearningConceptEstimate[]=[];
    for (const estimate of estimates) {
      const selected=this.latestObservations(observations.filter(item=>item.conceptId===estimate.conceptId));
      const evidenceFingerprint=fingerprint([LEARNING_ALGORITHM_VERSION,selected]);
      const previous=(await client.query<{evidence_fingerprint:string;review_revision:number;review_due_at:Date}>('SELECT evidence_fingerprint,review_revision,review_due_at FROM learning_concept_estimates WHERE user_id=$1 AND concept_id=$2',[userId,estimate.conceptId])).rows[0];
      if(previous?.evidence_fingerprint===evidenceFingerprint) concepts.push({...estimate,reviewRevision:previous.review_revision,reviewDueAt:iso(previous.review_due_at)});
      else {
        const revision=await this.nextReviewRevision(client,estimate.conceptId);
        await client.query(`INSERT INTO learning_concept_estimates(user_id,concept_id,algorithm_version,estimate,evidence_fingerprint,review_due_at,review_revision)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,concept_id) DO UPDATE SET
          algorithm_version=EXCLUDED.algorithm_version,estimate=EXCLUDED.estimate,evidence_fingerprint=EXCLUDED.evidence_fingerprint,
          review_due_at=EXCLUDED.review_due_at,review_revision=EXCLUDED.review_revision`,[userId,estimate.conceptId,LEARNING_ALGORITHM_VERSION,estimate,evidenceFingerprint,estimate.reviewDueAt,revision]);
        concepts.push({...estimate,reviewRevision:revision});
      }
    }
    await client.query('DELETE FROM learning_concept_estimates WHERE user_id=$1 AND NOT(concept_id=ANY($2::text[]))',[userId,concepts.map(item=>item.conceptId)]);
    const latest=this.latestObservations(observations);
    const unique=new Map(latest.map(item=>[item.logicalItemId,item]));
    const remaining=Number((await client.query<{ count:string }>(`SELECT (
      (SELECT count(*) FROM learning_evidence_work WHERE user_id=$1 AND processed_revision<revision)+
      (SELECT count(*) FROM gradebook_recipients r JOIN quiz_publications q ON q.policy_id=r.policy_id WHERE r.learner_id=$1
        AND EXISTS(SELECT 1 FROM gradebook_publications p WHERE p.recipient_id=r.id)
        AND NOT EXISTS(SELECT 1 FROM learning_evidence_work w WHERE w.user_id=$1 AND w.source_kind='quiz' AND w.source_id=r.id))+
      (SELECT count(*) FROM learning_practice_reports t WHERE t.user_id=$1
        AND NOT EXISTS(SELECT 1 FROM learning_evidence_work w WHERE w.user_id=$1 AND w.source_kind='practice' AND w.source_id=t.session_id))
      )::text AS count`,[userId])).rows[0].count);
    const recentActivityIds=[...new Set([...unique.values()].filter(item=>Date.parse(item.occurredAt)>=Date.parse(generatedAt)-14*86_400_000).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.sourceId.localeCompare(b.sourceId)).flatMap(item=>item.activityIds))].slice(0,10);
    return {algorithmVersion:LEARNING_ALGORITHM_VERSION,generatedAt,optOut:false,concepts,recentActivityIds,
      sourceSummary:{releasedQuizItems:[...unique.values()].filter(item=>item.sourceKind==='quiz').length,verifiedPracticeItems:[...unique.values()].filter(item=>item.sourceKind==='practice').length,independentItems:unique.size},
      processing:{pending:remaining>0,processedSources:work.rows.length,remainingSources:remaining}};
  }

  private latestObservations(items: LearningObservation[]): LearningObservation[] {
    const latest=new Map<string,LearningObservation>();
    for(const item of items) { const key=JSON.stringify([item.conceptId,item.logicalItemId]); const previous=latest.get(key);
      if(!previous||Date.parse(item.occurredAt)>Date.parse(previous.occurredAt)||(item.occurredAt===previous.occurredAt&&item.sourceId>previous.sourceId)) latest.set(key,item); }
    return [...latest.values()].sort((a,b)=>a.conceptId.localeCompare(b.conceptId)||a.logicalItemId.localeCompare(b.logicalItemId));
  }

  private async nextReviewRevision(client:PoolClient,conceptId:string):Promise<number> {
    const result=await client.query<{revision:number}>(`INSERT INTO learning_review_versions(user_id,concept_id,revision)VALUES($1,$2,1)
      ON CONFLICT(user_id,concept_id) DO UPDATE SET revision=learning_review_versions.revision+1 RETURNING revision`,[this.principal.userId,conceptId]);
    return result.rows[0].revision;
  }

  private async quizObservations(client: PoolClient,sourceId:string):Promise<{revision:string;observations:LearningObservation[]}|null> {
    const source=(await client.query<{ source_revision:string;released_at:Date;snapshot:{questions:{question:{questionId:string;versionId:string;conceptIds:string[];activityIds:string[]};maxUnits:number}[]};result:{items:{questionVersionId:string;selectedOptionId:string|null;earnedUnits:number;maxUnits:number}[]} }>(eligibleQuiz,[this.principal.userId,sourceId])).rows[0];
    if(!source) return null;
    const observations:LearningObservation[]=[];
    for(const selected of source.result.items) {
      // An omitted answer is missing evidence, not proof of a conceptual weakness.
      if(selected.selectedOptionId===null) continue;
      const question=source.snapshot.questions.find(item=>item.question.versionId===selected.questionVersionId)?.question;
      if(!question||selected.maxUnits<=0) continue;
      for(const conceptId of new Set(question.conceptIds)) observations.push({logicalItemId:`quiz:${question.questionId}`,conceptId,score:selected.earnedUnits/selected.maxUnits*100,sourceKind:'quiz',occurredAt:iso(source.released_at),sourceId:source.source_revision,activityIds:question.activityIds});
    }
    return {revision:source.source_revision,observations};
  }

  private async practiceObservations(client:PoolClient,sourceId:string):Promise<{revision:string;observations:LearningObservation[]}|null> {
    const source=(await client.query<{content_id:string;request_id:string;grade:{problemId?:string;version?:string;passed?:boolean;passedCount?:number;totalCount?:number;tests?:{passed?:boolean}[]};verified_at:Date}>(`SELECT content_id,request_id,grade,verified_at FROM learning_practice_reports WHERE session_id=$1 AND user_id=$2`,[sourceId,this.principal.userId])).rows[0];
    if(!source) return null;
    const activity=this.catalog.get(source.content_id),grade=source.grade;
    if(!activity||grade.problemId!==activity.practiceId||grade.version!==this.principal.practiceGradeVersion||!Number.isSafeInteger(grade.totalCount)||grade.totalCount!<=0||!Number.isSafeInteger(grade.passedCount)||grade.passedCount!<0||grade.passedCount!>grade.totalCount!||!Array.isArray(grade.tests)||grade.tests.length!==grade.totalCount||grade.tests.some(test=>typeof test.passed!=='boolean')||grade.tests.filter(test=>test.passed).length!==grade.passedCount||grade.passed!==(grade.passedCount===grade.totalCount)) return null;
    return {revision:source.request_id,observations:[...new Set(activity.conceptIds)].map(conceptId=>({logicalItemId:`practice:${activity.practiceId}`,conceptId,score:grade.passedCount!/grade.totalCount!*100,sourceKind:'practice',occurredAt:iso(source.verified_at),sourceId:source.request_id,activityIds:[activity.practiceId]}))};
  }
}

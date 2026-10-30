import { randomUUID } from 'node:crypto';
import { runner } from 'node-pg-migrate';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { PoolClient } from 'pg';
import { buildLearningDecision, freezeQuestionVersion, freezeQuizQuestionSelection, scoreMultipleChoiceQuiz, type LearningPracticeDescriptor } from '@leetcode-app/domain';
import { createDatabaseClient, type DatabaseClient, type DatabaseConfig } from '../src/client.js';
import { runMigrations } from '../src/migrations/index.js';
import { PostgresAssessmentDraftRepository } from '../src/repositories/assessment-draft.repository.js';
import { PostgresClassroomRepository } from '../src/repositories/classroom.repository.js';
import { PostgresGradebookRepository } from '../src/repositories/gradebook.repository.js';
import { PostgresQuizAssignmentRepository } from '../src/repositories/quiz-assignment.repository.js';
import { LearningEvidenceAccessError, LearningEvidenceConflictError, LearningEvidenceValidationError, learningDecisionKey, PostgresLearningEvidenceRepository } from '../src/repositories/learning-evidence.repository.js';
import { prepareSupabaseTestDatabase } from './support/supabase.js';

let container:StartedTestContainer,database:DatabaseClient,config:DatabaseConfig;
beforeAll(async()=>{
  container=await new GenericContainer('postgres:16-alpine').withEnvironment({POSTGRES_USER:'test',POSTGRES_PASSWORD:'test',POSTGRES_DB:'testdb'}).withExposedPorts(5432).start();
  config={host:container.getHost(),port:container.getMappedPort(5432),database:'testdb',user:'test',password:'test'};
  database=createDatabaseClient(config); await prepareSupabaseTestDatabase(database); await runMigrations(config);
},60_000);
afterEach(async()=>{if(database)await database.query('TRUNCATE users,classrooms,content_items CASCADE');});
afterAll(async()=>{await database?.close();await container?.stop();});
const person=async(role='learner')=>(await database.query<{id:string}>('INSERT INTO users(display_name,role) VALUES($1,$2) RETURNING id',[`Synthetic ${role}`,role])).rows[0].id;
const repository=(userId:string,catalog:LearningPracticeDescriptor[]=[])=>new PostgresLearningEvidenceRepository(database,{userId,practiceCatalog:catalog,practiceGradeVersion:'synthetic-v1'});
async function practiceFixture(userId=undefined as string|undefined){
  userId??=await person();
  const contentId=(await database.query<{id:string}>("INSERT INTO content_items(slug,type,status,difficulty,estimated_minutes,tags) VALUES($1,'problem','published','beginner',15,'{}') RETURNING id",[`synthetic-${randomUUID()}`])).rows[0].id;
  const catalog:LearningPracticeDescriptor[]=[{practiceId:'synthetic-pairs',contentId,label:'Synthetic pairs',conceptIds:['hash-maps'],difficulty:'foundation',estimatedMinutes:15}];
  return{userId,contentId,catalog,repo:repository(userId,catalog)};
}
async function session(userId:string,contentId:string,metadata:unknown={}){
  return(await database.query<{id:string}>('INSERT INTO practice_sessions(user_id,content_id,content_version,session_metadata) VALUES($1,$2,1,$3) RETURNING id',[userId,contentId,metadata])).rows[0].id;
}
async function verify(sessionId:string,passedCount:number,verifiedAt='2026-10-27T10:00:00.000Z'){
  const request={id:randomUUID(),source:'function synthetic(){}',language:'typescript',workspaceRevision:2};
  await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verificationRequest',$2::jsonb) WHERE id=$1",[sessionId,request]);
  const report={requestId:request.id,source:request.source,language:request.language,verifiedAt,grade:{problemId:'synthetic-pairs',version:'synthetic-v1',passed:passedCount===2,passedCount,totalCount:2,tests:[{name:'first',passed:passedCount>0},{name:'second',passed:passedCount>1}]}};
  await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verification',$2::jsonb) WHERE id=$1",[sessionId,report]);
  return report;
}
async function quizFixture(options:{userId?:string;version?:number;answer?:string|null;submitted?:boolean;closed?:boolean}={}){
  const instructorId=await person('instructor'),userId=options.userId??await person();
  const classes=new PostgresClassroomRepository(database,instructorId);
  const classroom=await classes.createClass({name:'Synthetic evidence class',description:'',actorId:instructorId,reason:'Synthetic regression'});
  await classes.joinClassByCode({userId,code:classroom.joinCode});
  const version=options.version??1;
  const frozen=freezeQuizQuestionSelection([{maxUnits:100,question:freezeQuestionVersion({questionId:'synthetic-invariant',version,versionId:`synthetic-invariant@${version}`,kind:'multiple_choice',status:'reviewed',title:'Private synthetic title',prompt:'Choose the invariant',difficulty:'foundation',activityIds:['synthetic-pairs'],conceptIds:['hash-maps'],options:[{id:'yes',text:'The correct choice',misconceptionTags:[]},{id:'no',text:'The incorrect choice',misconceptionTags:['synthetic-misconception']}],correctOptionId:'yes',explanation:'PRIVATE ANSWER EXPLANATION',provenance:{kind:'original',authorId:'synthetic-author',authoredAt:'2026-10-26T10:00:00.000Z'},review:{reviewerId:'synthetic-reviewer',reviewedAt:'2026-10-26T11:00:00.000Z',notes:'PRIVATE REVIEW NOTE'}})}]);
  const drafts=new PostgresAssessmentDraftRepository(database,{role:'instructor',userId:instructorId});
  const draft=await drafts.createDraft({draft:{classId:classroom.id,title:'Private assessment title',instructions:'Private assessment instructions',questions:[{questionVersionId:`synthetic-invariant@${version}`,maxUnits:100}],availableAt:null,dueAt:null,closesAt:options.closed?'2020-01-01T00:00:00.000Z':null},requestKey:randomUUID(),reason:'Synthetic draft'});
  const author=new PostgresQuizAssignmentRepository(database,{role:'instructor',userId:instructorId});
  const context=await author.readAuthorDraft(draft.id);
  const published=await author.publishDraft({draftId:draft.id,expectedRevision:1,expectedRosterFingerprint:context.rosterFingerprint,audience:{kind:'class',learnerIds:[userId]},snapshot:frozen,requestKey:randomUUID(),reason:'Synthetic publication'});
  const recipientId=(await database.query<{id:string}>('SELECT id FROM gradebook_recipients WHERE learner_id=$1 AND policy_id=$2',[userId,published.policyVersionId])).rows[0].id;
  const learner=new PostgresQuizAssignmentRepository(database,{role:'learner',userId});
  if(options.submitted!==false){
    await learner.saveAnswers({recipientId,expectedRevision:0,answers:{[`synthetic-invariant@${version}`]:options.answer===undefined?'no':options.answer},requestKey:randomUUID()});
    await learner.submitQuiz({recipientId,expectedRevision:1,requestKey:randomUUID()});
  }
  const grade=(await author.readInstructorQuiz(recipientId)).grade!;
  const teacherGrades=new PostgresGradebookRepository(database,{role:'instructor',userId:instructorId});
  const learnerGrades=new PostgresGradebookRepository(database,{role:'learner',userId});
  const release=()=>teacherGrades.publishGrade({recipientId,gradeRevisionId:grade.id,expectedPublicationSequence:0,reason:'Synthetic explicit release',requestKey:randomUUID()});
  return{userId,instructorId,classroom,recipientId,grade,teacherGrades,learnerGrades,release,repo:repository(userId)};
}
async function consent(userId:string,optOut:boolean){
  await database.query(`INSERT INTO learner_profiles(user_id,goal,experience,preferred_language,weekly_minutes,timezone,personalization_opt_out)
    VALUES($1,'interview','beginner','typescript',60,'UTC',$2) ON CONFLICT(user_id) DO UPDATE SET personalization_opt_out=EXCLUDED.personalization_opt_out`,[userId,optOut]);
}
async function diagnosticFixture(userId:string,answer:string|null='yes',submitted=true){
  const snapshot=freezeQuizQuestionSelection(Array.from({length:10},(_,index)=>{
    const questionId=index===0?'synthetic-invariant':`synthetic-diagnostic-${index}`;
    return {maxUnits:100,question:freezeQuestionVersion({questionId,version:1,versionId:`${questionId}@1`,kind:'multiple_choice',status:'reviewed',title:`Synthetic diagnostic ${index}`,prompt:'Choose the invariant.',difficulty:'foundation',activityIds:['synthetic-pairs'],conceptIds:['hash-maps'],
      options:[{id:'yes',text:'The invariant holds.',misconceptionTags:[]},{id:'no',text:'The invariant does not hold.',misconceptionTags:['synthetic-misconception']}],correctOptionId:'yes',explanation:'Synthetic explanation.',provenance:{kind:'original',authorId:'synthetic-author',authoredAt:'2026-10-26T10:00:00.000Z'},review:{reviewerId:'synthetic-reviewer',reviewedAt:'2026-10-26T11:00:00.000Z',notes:'Synthetic review.'}})};
  }));
  const blank=Object.fromEntries(snapshot.questions.map(item=>[item.question.versionId,null]));
  const id=(await database.query<{id:string}>(`INSERT INTO practice_diagnostics(user_id,selection_version,snapshot,snapshot_hash,answers)
    VALUES($1,$2,$3,encode(sha256(convert_to(($3::jsonb)::text,'UTF8')),'hex'),$4) RETURNING id`,[userId,`synthetic-${randomUUID()}`,snapshot,blank])).rows[0].id;
  if(submitted){
    const answers={...blank,'synthetic-invariant@1':answer};
    await database.query('UPDATE practice_diagnostics SET answers=$2,answer_revision=1 WHERE id=$1',[id,answers]);
    await database.query('UPDATE practice_diagnostics SET result=$2,submitted_at=clock_timestamp(),submit_request_key=$3 WHERE id=$1',[id,scoreMultipleChoiceQuiz(snapshot,answers),randomUUID()]);
  }
  return{id,snapshot};
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(accept=>{resolve=accept;});return{promise,resolve};}
async function waitUntilBlocked(waiter:number,blocker:number){
  const deadline=Date.now()+5_000;
  while(Date.now()<deadline){
    const state=await database.query<{blocked:boolean}>('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[waiter,blocker]);
    if(state.rows[0].blocked)return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Synthetic concurrent transaction did not reach its expected parent lock');
}

describe('durable owner learning evidence',()=>{
  it('builds stable decision keys from ranking inputs and records only explicit selections',async()=>{
    const f=await practiceFixture();
    const snapshot=await f.repo.readSnapshot();
    const decision=buildLearningDecision(snapshot,f.catalog);
    const key=learningDecisionKey(decision);
    expect(learningDecisionKey({...decision,generatedAt:'2099-01-01T00:00:00.000Z'})).toBe(key);
    expect((await database.query('SELECT * FROM learning_recommendation_selections')).rows).toEqual([]);
    const input={practiceId:'synthetic-pairs',expectedDecisionKey:key,requestKey:randomUUID()};
    const receipt=await f.repo.selectRecommendation(input);
    expect(receipt).toMatchObject({practiceId:input.practiceId,decisionKey:key,requestKey:input.requestKey});
    const history=await f.repo.readRecommendationSelections();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({receipt,observedOutcome:null,decision:{decisionVersion:'learning-decision-v1',curriculumVersion:'practice-catalog-v1'}});
    expect(history[0].decision.candidates[0].factors).toMatchObject({unknownConceptIds:['hash-maps'],knownConcepts:[],basePriority:45,unknownBonus:10});
    await expect(repository(f.userId,f.catalog).selectRecommendation(input)).resolves.toEqual(receipt);
    await expect(f.repo.selectRecommendation({...input,practiceId:'not-the-recommended-task'})).rejects.toBeInstanceOf(LearningEvidenceConflictError);
    await expect(f.repo.selectRecommendation({...input,requestKey:randomUUID(),expectedDecisionKey:'0'.repeat(64)})).rejects.toBeInstanceOf(LearningEvidenceConflictError);
    await expect(f.repo.selectRecommendation({...input,requestKey:'',expectedDecisionKey:key})).rejects.toBeInstanceOf(LearningEvidenceValidationError);
    expect((await database.query('SELECT * FROM learning_recommendation_selections')).rows).toHaveLength(1);
  });

  it('retains compact idempotent receipts after bounding detailed decisions to one hundred',async()=>{
    const f=await practiceFixture();
    const key=learningDecisionKey(buildLearningDecision(await f.repo.readSnapshot(),f.catalog));
    const input={practiceId:'synthetic-pairs',expectedDecisionKey:key,requestKey:randomUUID()};
    const first=await f.repo.selectRecommendation(input);
    for(let index=0;index<100;index++) await f.repo.selectRecommendation({...input,requestKey:randomUUID()});
    expect((await database.query('SELECT * FROM learning_recommendation_selections WHERE user_id=$1',[f.userId])).rows).toHaveLength(100);
    expect((await database.query('SELECT * FROM learning_recommendation_selections WHERE id=$1',[first.selectionId])).rows).toEqual([]);
    await expect(f.repo.selectRecommendation(input)).resolves.toEqual(first);
    expect((await database.query('SELECT * FROM learning_recommendation_receipts WHERE user_id=$1',[f.userId])).rows).toHaveLength(101);
  });

  it('attributes one trusted observed result to the latest matching selection without falling back to older clicks',async()=>{
    const f=await practiceFixture(),sessionId=await session(f.userId,f.contentId);
    await verify(sessionId,0);
    const key=learningDecisionKey(buildLearningDecision(await f.repo.readSnapshot(),f.catalog));
    const first=await f.repo.selectRecommendation({practiceId:'synthetic-pairs',expectedDecisionKey:key,requestKey:randomUUID()});
    const second=await f.repo.selectRecommendation({practiceId:'synthetic-pairs',expectedDecisionKey:key,requestKey:randomUUID()});
    const report=await verify(sessionId,2,new Date(Date.now()+10).toISOString());
    const history=await f.repo.readRecommendationSelections();
    expect(history.find(item=>item.receipt.selectionId===first.selectionId)?.observedOutcome).toBeNull();
    expect(history.find(item=>item.receipt.selectionId===second.selectionId)?.observedOutcome).toMatchObject({kind:'observed_practice_verification',requestId:report.requestId,score:100,passedCount:2,totalCount:2});
    await verify(sessionId,1,new Date(Date.now()+20).toISOString());
    const repeated=await f.repo.readRecommendationSelections();
    expect(repeated.filter(item=>item.observedOutcome)).toHaveLength(1);
    expect(repeated.find(item=>item.receipt.selectionId===second.selectionId)?.observedOutcome?.requestId).toBe(report.requestId);
  });

  it('excludes reports outside the fourteen-day selection window and clears private decisions on opt-out',async()=>{
    const f=await practiceFixture(),sessionId=await session(f.userId,f.contentId);
    const key=learningDecisionKey(buildLearningDecision(await f.repo.readSnapshot(),f.catalog));
    const input={practiceId:'synthetic-pairs',expectedDecisionKey:key,requestKey:randomUUID()};
    const selected=await f.repo.selectRecommendation(input);
    await database.query("UPDATE learning_recommendation_selections SET selected_at=clock_timestamp()-interval '15 days' WHERE id=$1",[selected.selectionId]);
    await verify(sessionId,2,new Date().toISOString());
    expect((await f.repo.readRecommendationSelections())[0].observedOutcome).toBeNull();
    const other=await person();
    expect(await repository(other,f.catalog).readRecommendationSelections()).toEqual([]);
    await consent(f.userId,true);
    expect((await database.query('SELECT * FROM learning_recommendation_selections WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    expect((await database.query('SELECT * FROM learning_recommendation_receipts WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    await expect(f.repo.selectRecommendation(input)).rejects.toBeInstanceOf(LearningEvidenceConflictError);
    expect(await f.repo.readRecommendationSelections()).toEqual([]);
  });

  it('keeps PostgreSQL microsecond precision when choosing the latest same-millisecond selection',async()=>{
    const f=await practiceFixture(),sessionId=await session(f.userId,f.contentId);
    const key=learningDecisionKey(buildLearningDecision(await f.repo.readSnapshot(),f.catalog));
    const input={practiceId:'synthetic-pairs',expectedDecisionKey:key};
    const older=await f.repo.selectRecommendation({...input,requestKey:randomUUID()});
    const latest=await f.repo.selectRecommendation({...input,requestKey:randomUUID()});
    await database.query("UPDATE learning_recommendation_selections SET selected_at='2026-10-29T10:00:00.000000Z' WHERE id=$1",[older.selectionId]);
    await database.query("UPDATE learning_recommendation_selections SET selected_at='2026-10-29T10:00:00.000600Z' WHERE id=$1",[latest.selectionId]);
    const report=await verify(sessionId,2,'2026-10-29T10:00:00.000800Z');
    const history=await f.repo.readRecommendationSelections();
    expect(history.find(item=>item.receipt.selectionId===older.selectionId)?.observedOutcome).toBeNull();
    expect(history.find(item=>item.receipt.selectionId===latest.selectionId)?.observedOutcome).toMatchObject({requestId:report.requestId,score:100});
  });

  it('does not let repeated reports for a finished selection starve another eligible observed outcome',async()=>{
    const first=await practiceFixture();
    const initialKey=learningDecisionKey(buildLearningDecision(await first.repo.readSnapshot(),first.catalog));
    await first.repo.selectRecommendation({practiceId:'synthetic-pairs',expectedDecisionKey:initialKey,requestKey:randomUUID()});
    const latest=await first.repo.selectRecommendation({practiceId:'synthetic-pairs',expectedDecisionKey:initialKey,requestKey:randomUUID()});
    await verify(await session(first.userId,first.contentId),2,new Date(Date.now()+100).toISOString());
    await first.repo.readRecommendationSelections();
    const reportBase=Date.now()+1_000;
    for(let index=0;index<101;index++) await verify(await session(first.userId,first.contentId),2,new Date(reportBase+index).toISOString());
    const contentId=(await database.query<{id:string}>("INSERT INTO content_items(slug,type,status,difficulty,estimated_minutes,tags)VALUES($1,'problem','published','beginner',15,'{}')RETURNING id",[`synthetic-second-${randomUUID()}`])).rows[0].id;
    const second={...first.catalog[0],practiceId:'synthetic-second',contentId,label:'Synthetic second'};
    const catalog=[...first.catalog,second],repo=repository(first.userId,catalog);
    let snapshot=await repo.readSnapshot();
    while(snapshot.processing.pending) snapshot=await repo.readSnapshot();
    const key=learningDecisionKey(buildLearningDecision(snapshot,catalog));
    const selected=await repo.selectRecommendation({practiceId:second.practiceId,expectedDecisionKey:key,requestKey:randomUUID()});
    const sessionId=await session(first.userId,contentId),request={id:randomUUID(),source:'synthetic second source',language:'typescript',workspaceRevision:2};
    await database.query("UPDATE practice_sessions SET session_metadata=jsonb_build_object('verificationRequest',$2::jsonb)WHERE id=$1",[sessionId,request]);
    const verification={requestId:request.id,source:request.source,language:request.language,verifiedAt:new Date(reportBase+5_000).toISOString(),grade:{problemId:second.practiceId,version:'synthetic-v1',passed:true,passedCount:2,totalCount:2,tests:[{passed:true},{passed:true}]}};
    await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verification',$2::jsonb)WHERE id=$1",[sessionId,verification]);
    const history=await repo.readRecommendationSelections();
    expect(history.find(item=>item.receipt.selectionId===latest.selectionId)?.observedOutcome).toBeTruthy();
    expect(history.find(item=>item.receipt.selectionId===selected.selectionId)?.observedOutcome).toMatchObject({requestId:request.id,practiceId:second.practiceId,score:100});
    expect(history.filter(item=>item.observedOutcome)).toHaveLength(2);
  });

  it('deduplicates diagnostic/class copies, ignores unsubmitted and omitted answers, and keeps academic grades unchanged',async()=>{
    const f=await quizFixture();await f.release();
    await diagnosticFixture(f.userId,'yes',false);
    expect((await f.repo.readSnapshot()).sourceSummary).toMatchObject({releasedQuizItems:1,independentItems:1});
    await diagnosticFixture(f.userId,null);
    expect((await f.repo.readSnapshot()).concepts[0]).toMatchObject({score:40,independentItems:1});
    const diagnostic=await diagnosticFixture(f.userId,'yes');
    const result=await f.repo.readSnapshot();
    expect(result.concepts[0]).toMatchObject({score:60,independentItems:1});
    expect(result.sourceSummary).toMatchObject({releasedQuizItems:0,diagnosticItems:1,independentItems:1});
    expect((await database.query('SELECT earned_units FROM gradebook_grade_revisions WHERE id=$1',[f.grade.id])).rows[0].earned_units).toBe('0');
    await database.query('DELETE FROM practice_diagnostics WHERE id=$1',[diagnostic.id]);
    expect((await f.repo.readSnapshot()).concepts[0]).toMatchObject({score:40,independentItems:1});
  });

  it('keeps recommendation details and receipts private even if broad grants are accidentally added',async()=>{
    const f=await practiceFixture();
    const key=learningDecisionKey(buildLearningDecision(await f.repo.readSnapshot(),f.catalog));
    await f.repo.selectRecommendation({practiceId:'synthetic-pairs',expectedDecisionKey:key,requestKey:randomUUID()});
    const tables=['learning_recommendation_selections','learning_recommendation_receipts'];
    for(const table of tables){
      expect((await database.query<{allowed:boolean}>("SELECT has_table_privilege('authenticated',$1,'SELECT') AS allowed",[table])).rows[0].allowed).toBe(false);
      expect((await database.query<{relrowsecurity:boolean}>('SELECT relrowsecurity FROM pg_class WHERE relname=$1',[table])).rows[0].relrowsecurity).toBe(true);
    }
    await expect(database.transaction(async client=>{
      await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON learning_recommendation_selections,learning_recommendation_receipts TO authenticated');
      await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.userId]);
      for(const table of tables) expect((await client.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      await client.query('INSERT INTO learning_recommendation_receipts(user_id,request_key,input_fingerprint,receipt)VALUES($1,$2,$3,$4)',[f.userId,randomUUID(),'0'.repeat(64),{}]);
    })).rejects.toMatchObject({code:'42501'});
    expect((await database.query<{allowed:boolean}>("SELECT has_function_privilege('authenticated','learning_clear_recommendation_consent()','EXECUTE') AS allowed")).rows[0].allowed).toBe(false);
  });

  it('captures only reserved server practice reports, persists across clients, replaces repeats, and preserves legacy mastery/reviews',async()=>{
    const f=await practiceFixture();
    await database.query("INSERT INTO concept_mastery(user_id,concept_id,score,confidence)VALUES($1,'hash-maps',99,0.99)",[f.userId]);
    await database.query("INSERT INTO scheduled_reviews(user_id,concept_id,interval_days,due_at)VALUES($1,'hash-maps',60,'2026-12-01')",[f.userId]);
    const legacy=await session(f.userId,f.contentId,{verification:{requestId:'unanchored',grade:{passed:true,passedCount:2,totalCount:2}}});
    const manual=await session(f.userId,f.contentId,{workspaceState:{pseudocodeEvaluation:{score:100},continueOverride:true}});
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    const first=await session(f.userId,f.contentId); await verify(first,0);
    const failed=await f.repo.readSnapshot();
    expect(failed.concepts[0]).toMatchObject({conceptId:'hash-maps',independentItems:1,evidenceStatus:'limited'});
    expect(failed.concepts[0].score).toBeLessThan(50);
    const second=await session(f.userId,f.contentId);await verify(second,2,'2026-10-28T10:00:00.000Z');
    const fresh=createDatabaseClient(config);
    try{
      const resumed=await new PostgresLearningEvidenceRepository(fresh,{userId:f.userId,practiceCatalog:f.catalog,practiceGradeVersion:'synthetic-v1'}).readSnapshot();
      expect(resumed.concepts[0]).toMatchObject({independentItems:1,confidence:failed.concepts[0].confidence,lastEvidenceAt:'2026-10-28T10:00:00.000Z'});
      expect(resumed.concepts[0].score).toBeGreaterThan(50);
      expect(resumed.sourceSummary).toEqual({releasedQuizItems:0,verifiedPracticeItems:1,independentItems:1});
      // An older arriving completion cannot rewind the newest independent activity.
      await verify(first,0,'2026-10-26T10:00:00.000Z');
      expect((await f.repo.readSnapshot()).concepts[0].score).toBe(resumed.concepts[0].score);
      expect((await repository(await person(),f.catalog).readSnapshot()).concepts).toEqual([]);
    }finally{await fresh.close();}
    expect((await database.query('SELECT score,confidence FROM concept_mastery WHERE user_id=$1',[f.userId])).rows[0]).toEqual({score:99,confidence:'0.99'});
    expect((await database.query('SELECT interval_days FROM scheduled_reviews WHERE user_id=$1',[f.userId])).rows[0].interval_days).toBe(60);
    expect([legacy,manual]).toHaveLength(2);
  });

  it('uses trusted report counters rather than completion state and ignores unsupported or empty reports',async()=>{
    const f=await practiceFixture(),sessionId=await session(f.userId,f.contentId);
    await database.query("UPDATE practice_sessions SET status='completed' WHERE id=$1",[sessionId]);
    const report=await verify(sessionId,0);
    expect((await f.repo.readSnapshot()).concepts[0].score).toBeLessThan(50);
    const next={id:randomUUID(),source:'synthetic next source',language:'typescript',workspaceRevision:3};
    await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verificationRequest',$2::jsonb) WHERE id=$1",[sessionId,next]);
    await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verification',$2::jsonb) WHERE id=$1",[sessionId,{...report,requestId:next.id,source:next.source,grade:{...report.grade,version:'unsupported-version'}}]);
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    const empty={id:randomUUID(),source:'synthetic empty source',language:'typescript',workspaceRevision:4};
    await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verificationRequest',$2::jsonb) WHERE id=$1",[sessionId,empty]);
    await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verification',$2::jsonb) WHERE id=$1",[sessionId,{...report,requestId:empty.id,source:empty.source,grade:{...report.grade,passed:true,passedCount:0,totalCount:0,tests:[]}}]);
    expect((await f.repo.readSnapshot()).sourceSummary.independentItems).toBe(0);
  });

  it('uses only explicitly released MCQ results, keeps private payloads private, and deduplicates copied/versioned questions',async()=>{
    const f=await quizFixture();
    const immutableBefore=(await database.query('SELECT * FROM gradebook_grade_revisions WHERE recipient_id=$1',[f.recipientId])).rows;
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    await f.release();
    const released=await f.repo.readSnapshot();
    expect(released.concepts[0]).toMatchObject({score:40,confidence:0.2,independentItems:1});
    expect(JSON.stringify(released)).not.toMatch(/correctOptionId|explanation|misconceptionTags|PRIVATE|private_note|questionVersionId|selectedOptionId|quiz_score_id|snapshot/);
    const copy=await quizFixture({userId:f.userId,version:2,answer:'yes'});await copy.release();
    const newer=await f.repo.readSnapshot();
    expect(newer.concepts[0]).toMatchObject({score:60,confidence:0.2,independentItems:1});
    expect(newer.sourceSummary.releasedQuizItems).toBe(1);
    expect((await database.query('SELECT * FROM gradebook_grade_revisions WHERE recipient_id=$1',[f.recipientId])).rows).toEqual(immutableBefore);
  });

  it('suspends disputed or excused evidence and restores it when withdrawn/reassigned without touching grades',async()=>{
    const f=await quizFixture();await f.release();const original=(await f.repo.readSnapshot()).concepts[0];
    const opened=await f.learnerGrades.openGradeDispute({recipientId:f.recipientId,expectedDisputeEventId:null,gradeRevisionId:f.grade.id,reason:'Synthetic dispute',requestKey:randomUUID()});
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    await f.learnerGrades.withdrawGradeDispute({recipientId:f.recipientId,expectedDisputeEventId:opened.id,requestKey:randomUUID()});
    expect((await f.repo.readSnapshot()).concepts[0].score).toBe(40);
    await expect(f.repo.snoozeReview({conceptId:original.conceptId,expectedRevision:original.reviewRevision,days:1,requestKey:randomUUID()})).rejects.toBeInstanceOf(LearningEvidenceConflictError);
    const current=(await database.query<{id:string}>('SELECT id FROM gradebook_applicability_revisions WHERE recipient_id=$1 ORDER BY sequence DESC LIMIT 1',[f.recipientId])).rows[0];
    const excused=await f.teacherGrades.setRecipientApplicability({recipientId:f.recipientId,applicability:'excused',expectedApplicabilityRevisionId:current.id,reason:'Synthetic excusal',requestKey:randomUUID()});
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    await f.teacherGrades.setRecipientApplicability({recipientId:f.recipientId,applicability:'assigned',expectedApplicabilityRevisionId:excused.id,reason:'Synthetic restored applicability',requestKey:randomUUID()});
    expect((await f.repo.readSnapshot()).concepts[0].score).toBe(40);
    expect((await database.query('SELECT earned_units FROM gradebook_grade_revisions WHERE recipient_id=$1',[f.recipientId])).rows).toEqual([{earned_units:'0'}]);
  });

  it('treats omitted answers as missing evidence, not a conceptual failure',async()=>{
    const f=await quizFixture({answer:null});await f.release();
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    expect(f.grade.earnedUnits).toBe(0);
  });

  it('ignores a released academic missing-work zero without manufacturing a skill failure',async()=>{
    const f=await quizFixture({submitted:false,closed:true});
    const zero=await f.teacherGrades.appendGrade({recipientId:f.recipientId,attemptId:null,expectedGradeRevisionId:null,kind:'missing_zero',criterionScores:{},reason:'Synthetic closed missing assignment',requestKey:randomUUID()});
    await f.teacherGrades.publishGrade({recipientId:f.recipientId,gradeRevisionId:zero.id,expectedPublicationSequence:0,reason:'Synthetic zero release',requestKey:randomUUID()});
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    expect((await database.query('SELECT earned_units,kind FROM gradebook_grade_revisions WHERE id=$1',[zero.id])).rows[0]).toEqual({earned_units:'0',kind:'missing_zero'});
  });

  it('keeps the released result during a withheld correction and suspends evidence when a non-skill correction is released',async()=>{
    const f=await quizFixture();await f.release();const original=await f.repo.readSnapshot();
    // Imported historical correction shapes may be present in the immutable ledger
    // even though current MCQ authoring permits only deterministic scored results.
    const correction=(await database.query<{id:string}>(`INSERT INTO gradebook_grade_revisions(recipient_id,policy_id,sequence,supersedes_id,kind,earned_units,evaluator_version_id,criterion_scores,reason,authored_by,request_key,private_note)
      SELECT recipient_id,policy_id,sequence+1,id,'missing_zero',0,'instructor-missing-zero-v1','{}','Synthetic imported correction',$2,$3,'PRIVATE CORRECTION NOTE'
      FROM gradebook_grade_revisions WHERE id=$1 RETURNING id`,[f.grade.id,f.instructorId,randomUUID()])).rows[0];
    expect((await f.repo.readSnapshot()).concepts).toEqual(original.concepts);
    await database.query(`INSERT INTO gradebook_publications(recipient_id,policy_id,grade_revision_id,sequence,reason,published_by,request_key)
      SELECT recipient_id,policy_id,$2,2,'Synthetic imported correction release',$3,$4 FROM gradebook_grade_revisions WHERE id=$1`,[f.grade.id,correction.id,f.instructorId,randomUUID()]);
    expect((await f.repo.readSnapshot()).concepts).toEqual([]);
    expect((await database.query('SELECT earned_units FROM gradebook_grade_revisions WHERE id=$1',[f.grade.id])).rows[0].earned_units).toBe('0');
  });

  it('persists compare-and-swap snoozes and the exact original idempotent receipt',async()=>{
    const f=await practiceFixture();await verify(await session(f.userId,f.contentId),2);
    const original=(await f.repo.readSnapshot()).concepts[0];
    const input={conceptId:original.conceptId,expectedRevision:original.reviewRevision,days:1 as const,requestKey:randomUUID()};
    const first=await f.repo.snoozeReview(input);
    expect(first.receipt).toMatchObject({previousRevision:1,revision:2});
    await expect(f.repo.snoozeReview({...input,requestKey:randomUUID()})).rejects.toBeInstanceOf(LearningEvidenceConflictError);
    const second=await f.repo.snoozeReview({...input,expectedRevision:2,days:3,requestKey:randomUUID()});
    const replay=await f.repo.snoozeReview(input);
    expect(replay.receipt).toEqual(first.receipt);
    expect((await f.repo.snoozeReview({requestKey:input.requestKey,days:input.days,expectedRevision:input.expectedRevision,conceptId:input.conceptId})).receipt).toEqual(first.receipt);
    expect(replay.snapshot.concepts[0].reviewDueAt).toBe(second.receipt.dueAt);
    await expect(f.repo.snoozeReview({...input,days:7})).rejects.toBeInstanceOf(LearningEvidenceConflictError);
  });

  it('rolls back source capture and projection checkpoints together and retries safely after failure',async()=>{
    const f=await practiceFixture(),sessionId=await session(f.userId,f.contentId);
    const reserved={id:randomUUID(),source:'synthetic source',language:'typescript',workspaceRevision:2};
    await database.query("UPDATE practice_sessions SET session_metadata=jsonb_build_object('verificationRequest',$2::jsonb) WHERE id=$1",[sessionId,reserved]);
    const report={requestId:reserved.id,source:reserved.source,language:reserved.language,verifiedAt:'2026-10-27T10:00:00.000Z',grade:{problemId:'synthetic-pairs',version:'synthetic-v1',passed:true,passedCount:2,totalCount:2,tests:[{passed:true},{passed:true}]}};
    await expect(database.transaction(async client=>{
      await client.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verification',$2::jsonb) WHERE id=$1",[sessionId,report]);
      throw new Error('Synthetic failure before producer commit');
    })).rejects.toThrow('Synthetic failure');
    expect((await database.query('SELECT * FROM learning_practice_reports WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    expect((await database.query('SELECT * FROM learning_evidence_work WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    await database.query("UPDATE practice_sessions SET session_metadata=session_metadata||jsonb_build_object('verification',$2::jsonb) WHERE id=$1",[sessionId,report]);
    await database.query(`CREATE FUNCTION synthetic_projection_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'Synthetic projection failure'; END$$;
      CREATE TRIGGER synthetic_projection_failure BEFORE INSERT ON learning_concept_estimates FOR EACH ROW EXECUTE FUNCTION synthetic_projection_failure()`);
    try{await expect(f.repo.readSnapshot()).rejects.toThrow('Synthetic projection failure');}
    finally{await database.query('DROP TRIGGER synthetic_projection_failure ON learning_concept_estimates;DROP FUNCTION synthetic_projection_failure()');}
    expect((await database.query('SELECT processed_revision FROM learning_evidence_work WHERE user_id=$1',[f.userId])).rows[0].processed_revision).toBe('0');
    const recovered=await f.repo.readSnapshot();expect(recovered.concepts).toHaveLength(1);
    expect((await f.repo.readSnapshot()).processing.processedSources).toBe(0);
    // Owner-only replay may rebuild derived state from its private trusted capture.
    // It must not need the mutable session JSON or any other learner's records.
    for(const table of ['learning_evidence_work','learning_evidence_sources','learning_concept_estimates'])await database.query(`DELETE FROM ${table} WHERE user_id=$1`,[f.userId]);
    const rebuilt=await f.repo.readSnapshot();
    expect(rebuilt.concepts[0].score).toBe(recovered.concepts[0].score);
    expect(rebuilt.concepts[0].reviewRevision).toBeGreaterThan(recovered.concepts[0].reviewRevision);
    expect(rebuilt.processing.processedSources).toBe(1);
  });

  it('honors opt-out atomically, permits quiz backfill after opt-in, and clears private state on deletion',async()=>{
    const f=await quizFixture();await f.release();const original=(await f.repo.readSnapshot()).concepts[0];
    const input={conceptId:original.conceptId,expectedRevision:original.reviewRevision,days:1 as const,requestKey:randomUUID()};
    const accepted=await f.repo.snoozeReview(input);
    await consent(f.userId,true);
    expect(await f.repo.readSnapshot()).toMatchObject({optOut:true,concepts:[],sourceSummary:{independentItems:0}});
    expect((await f.repo.snoozeReview(input)).receipt).toEqual(accepted.receipt);
    expect((await database.query('SELECT * FROM learning_evidence_sources WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    await consent(f.userId,false);
    expect((await f.repo.readSnapshot()).concepts[0].score).toBe(40);
    await expect(f.repo.snoozeReview({...input,requestKey:randomUUID()})).rejects.toBeInstanceOf(LearningEvidenceConflictError);
    await database.query('DELETE FROM users WHERE id=$1',[f.userId]);
    for(const table of ['learning_review_versions','learning_evidence_sources','learning_evidence_work','learning_concept_estimates','learning_review_receipts','learning_practice_reports']) expect((await database.query(`SELECT * FROM ${table} WHERE user_id=$1`,[f.userId])).rows).toEqual([]);
    await expect(f.repo.readSnapshot()).rejects.toBeInstanceOf(LearningEvidenceAccessError);
  });

  it('denies browser private reads/writes and every trusted-metadata insertion/replacement/removal',async()=>{
    const f=await practiceFixture(),sessionId=await session(f.userId,f.contentId);
    const report=await verify(sessionId,2);
    await database.query('GRANT SELECT,INSERT,UPDATE,DELETE ON practice_sessions TO authenticated');
    const client=await database.getPool().connect();
    async function browser(sql:string,args:unknown[]=[]){
      await client.query('BEGIN');
      try{await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.userId]);return await client.query(sql,args);}
      finally{await client.query('ROLLBACK');}
    }
    try{
      for(const table of ['learning_review_versions','learning_evidence_sources','learning_evidence_work','learning_concept_estimates','learning_review_receipts','learning_practice_reports']){
        await expect(browser(`SELECT * FROM ${table}`)).rejects.toMatchObject({code:'42501'});
        await expect(browser(`DELETE FROM ${table}`)).rejects.toMatchObject({code:'42501'});
        expect((await database.query<{relrowsecurity:boolean}>('SELECT relrowsecurity FROM pg_class WHERE relname=$1',[table])).rows[0].relrowsecurity).toBe(true);
      }
      for(const metadata of [{},{verification:report},{verificationRequest:{id:'forged'}},{verification:{...report,requestId:'forged'},verificationRequest:{id:'forged'}}]){
        await expect(browser('UPDATE practice_sessions SET session_metadata=$2 WHERE id=$1',[sessionId,metadata])).rejects.toMatchObject({code:'42501'});
      }
      await expect(browser('INSERT INTO practice_sessions(user_id,content_id,content_version,session_metadata)VALUES($1,$2,1,$3)',[f.userId,f.contentId,{verification:report}])).rejects.toMatchObject({code:'42501'});
      await expect(browser('INSERT INTO practice_sessions(user_id,content_id,content_version,session_metadata)VALUES($1,$2,1,$3)',[f.userId,f.contentId,{verificationRequest:{id:'forged'}}])).rejects.toMatchObject({code:'42501'});
      await expect(browser('SELECT learning_capture_practice_report()')).rejects.toMatchObject({code:'42501'});
      for(const name of ['learning_capture_practice_report','learning_queue_quiz_source','learning_clear_deleted_source','learning_personalization_consent']){
        expect((await database.query<{allowed:boolean}>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed",[`${name}()`])).rows[0].allowed).toBe(false);
      }
      await expect(browser("UPDATE practice_sessions SET session_metadata=jsonb_set(session_metadata,'{workspaceState}','{}') WHERE id=$1",[sessionId])).resolves.toBeTruthy();
      await expect(browser('DELETE FROM practice_sessions WHERE id=$1',[sessionId])).resolves.toBeTruthy();
      // A trusted server cannot complete a report without the previously reserved request.
      const unreserved=await session(f.userId,f.contentId);
      await expect(database.query("UPDATE practice_sessions SET session_metadata=jsonb_build_object('verification',$2::jsonb) WHERE id=$1",[unreserved,report])).rejects.toMatchObject({code:'23514'});
    }finally{client.release();}
  });

  it('keeps private source rows behind RLS even if a future browser grant is accidentally added',async()=>{
    const f=await practiceFixture();await verify(await session(f.userId,f.contentId),2);await f.repo.readSnapshot();
    await expect(database.transaction(async client=>{
      await client.query('GRANT SELECT,INSERT,UPDATE,DELETE ON learning_practice_reports,learning_evidence_sources,learning_concept_estimates,learning_review_versions,learning_review_receipts,learning_evidence_work TO authenticated');
      await client.query('SET LOCAL ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[f.userId]);
      for(const table of ['learning_practice_reports','learning_evidence_sources','learning_concept_estimates','learning_review_versions','learning_review_receipts','learning_evidence_work']) expect((await client.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      await client.query("INSERT INTO learning_evidence_work(user_id,source_kind,source_id)VALUES($1,'practice',$2)",[f.userId,randomUUID()]);
    })).rejects.toMatchObject({code:'42501'});
  });

  it('serializes release before learner deletion without a child-parent outbox deadlock',async()=>{
    const f=await quizFixture(),locked=deferred(),resume=deferred();let releasePid=0;
    const gated=Object.create(database) as DatabaseClient;
    gated.transaction=callback=>database.transaction(async client=>{
      releasePid=(await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return callback(new Proxy(client,{get(target,key){
        if(key==='query')return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args);
          if(typeof args[0]==='string'&&args[0].includes('FOR UPDATE OF r FOR SHARE OF c')){locked.resolve();await resume.promise;}
          return result;
        };
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      }}) as PoolClient);
    });
    const releasing=new PostgresGradebookRepository(gated,{role:'instructor',userId:f.instructorId}).publishGrade({recipientId:f.recipientId,gradeRevisionId:f.grade.id,expectedPublicationSequence:0,reason:'Synthetic concurrent release',requestKey:randomUUID()});
    await Promise.race([locked.promise,releasing.then(()=>{throw new Error('Synthetic release gate was not reached');})]);
    const deletion=await database.getPool().connect();let deleting:Promise<unknown>|undefined;
    try{
      await deletion.query('SET statement_timeout=8000');
      const deletingPid=(await deletion.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      deleting=deletion.query('DELETE FROM users WHERE id=$1',[f.userId]);
      await waitUntilBlocked(deletingPid,releasePid);
      resume.resolve();
      await expect(releasing).resolves.toMatchObject({sequence:1});
      await expect(deleting).resolves.toBeTruthy();
      expect((await database.query('SELECT * FROM learning_evidence_work WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    }finally{resume.resolve();await Promise.allSettled([releasing,...(deleting?[deleting]:[])]);await deletion.query('RESET statement_timeout');deletion.release();}
  });

  it('serializes profile upsert consent and role changes behind an active owner read',async()=>{
    const f=await practiceFixture();await verify(await session(f.userId,f.contentId),2);
    const locked=deferred(),resume=deferred();let readerPid=0;
    const gated=Object.create(database) as DatabaseClient;
    gated.transaction=callback=>database.transaction(async client=>{
      readerPid=(await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return callback(new Proxy(client,{get(target,key){
        if(key==='query')return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args);
          if(typeof args[0]==='string'&&args[0]==='SELECT id FROM users WHERE id=$1 FOR UPDATE'){locked.resolve();await resume.promise;}
          return result;
        };
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      }}) as PoolClient);
    });
    const reading=new PostgresLearningEvidenceRepository(gated,{userId:f.userId,practiceCatalog:f.catalog,practiceGradeVersion:'synthetic-v1'}).readSnapshot();
    await Promise.race([locked.promise,reading.then(()=>{throw new Error('Synthetic owner-read gate was not reached');})]);
    const writer=await database.getPool().connect();let writing:Promise<unknown>|undefined;
    try{
      await writer.query('SET statement_timeout=8000');
      const writerPid=(await writer.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      writing=writer.query(`INSERT INTO learner_profiles(user_id,goal,experience,preferred_language,weekly_minutes,timezone,personalization_opt_out)
        VALUES($1,'interview','beginner','typescript',60,'UTC',true) ON CONFLICT(user_id) DO UPDATE SET personalization_opt_out=true`,[f.userId]);
      await waitUntilBlocked(writerPid,readerPid);resume.resolve();
      expect((await reading).concepts).toHaveLength(1);await writing;
      expect((await f.repo.readSnapshot()).concepts).toEqual([]);
      expect((await database.query('SELECT * FROM learning_concept_estimates WHERE user_id=$1',[f.userId])).rows).toEqual([]);
      // The same parent lock also prevents a lifecycle role update from crossing a read.
      await writer.query('BEGIN');await writer.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[f.userId]);
      const roleWriter=await database.getPool().connect();let changing:Promise<unknown>|undefined;
      try{
        const changingPid=(await roleWriter.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        changing=roleWriter.query("UPDATE users SET role='instructor' WHERE id=$1",[f.userId]);
        await waitUntilBlocked(changingPid,writerPid);
        await writer.query('COMMIT');await changing;
      }finally{await writer.query('ROLLBACK');if(changing)await Promise.allSettled([changing]);roleWriter.release();}
    }finally{resume.resolve();await Promise.allSettled([reading,...(writing?[writing]:[])]);await writer.query('ROLLBACK');await writer.query('RESET statement_timeout');writer.release();}
  });

  it('serializes the actual profile upsert before a concurrent parent-account deletion',async()=>{
    const f=await practiceFixture();await consent(f.userId,false);await verify(await session(f.userId,f.contentId),2);await f.repo.readSnapshot();
    const writer=await database.getPool().connect(),deleter=await database.getPool().connect();let deleting:Promise<unknown>|undefined;
    try{
      await writer.query('BEGIN');await deleter.query('SET statement_timeout=8000');
      const writerPid=(await writer.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const deletePid=(await deleter.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await writer.query(`INSERT INTO learner_profiles(user_id,goal,experience,preferred_language,weekly_minutes,timezone,personalization_opt_out)
        VALUES($1,'interview','beginner','typescript',60,'UTC',true) ON CONFLICT(user_id) DO UPDATE SET personalization_opt_out=true`,[f.userId]);
      deleting=deleter.query('DELETE FROM users WHERE id=$1',[f.userId]);
      await waitUntilBlocked(deletePid,writerPid);await writer.query('COMMIT');await deleting;
      expect((await database.query('SELECT * FROM learner_profiles WHERE user_id=$1',[f.userId])).rows).toEqual([]);
      expect((await database.query('SELECT * FROM learning_practice_reports WHERE user_id=$1',[f.userId])).rows).toEqual([]);
    }finally{await writer.query('ROLLBACK');if(deleting)await Promise.allSettled([deleting]);await deleter.query('RESET statement_timeout');writer.release();deleter.release();}
  });

  it('bounds owner pumping, recovers rollback without dropping evidence, and rebuilds quiz sources after additive migration restore',async()=>{
    const f=await quizFixture();await f.release();
    const other=await person();
    await database.query(`INSERT INTO learning_evidence_work(user_id,source_kind,source_id,requested_at) SELECT $1,'quiz',gen_random_uuid(),'2020-01-01' FROM generate_series(1,102)`,[f.userId]);
    await database.query(`INSERT INTO learning_evidence_work(user_id,source_kind,source_id)VALUES($1,'quiz',gen_random_uuid())`,[other]);
    const partial=await f.repo.readSnapshot();expect(partial.processing).toEqual({pending:true,processedSources:100,remainingSources:3});
    expect((await database.query('SELECT * FROM learning_evidence_work WHERE user_id=$1 AND processed_revision=0',[other])).rows).toHaveLength(1);
    const finished=await f.repo.readSnapshot();expect(finished.processing.pending).toBe(false);expect(finished.concepts).toHaveLength(1);
    const before=(await database.query('SELECT * FROM gradebook_publications WHERE recipient_id=$1',[f.recipientId])).rows;
    const url=`postgresql://test:test@${config.host}:${config.port}/testdb`;
    const reverse=()=>runner({databaseUrl:url,direction:'down',dir:'migrations',migrationsTable:'pgmigrations',count:1,checkOrder:true,log:()=>undefined});
    await expect(reverse()).rejects.toThrow('Cannot reverse used learning evidence storage');
    // Only this disposable synthetic database is reset; academic source records stay intact.
    await database.query('TRUNCATE learning_review_versions,learning_evidence_work,learning_practice_reports,learning_evidence_sources,learning_concept_estimates,learning_review_receipts');
    await reverse();
    await runMigrations(config);
    expect((await f.repo.readSnapshot()).concepts[0]).toMatchObject({score:40,independentItems:1});
    expect((await database.query('SELECT * FROM gradebook_publications WHERE recipient_id=$1',[f.recipientId])).rows).toEqual(before);
  });
});

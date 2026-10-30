import { describe, expect, it } from 'vitest';
import { buildLearningDecision, buildLearningPlan, estimateLearningConcepts, LEARNING_ALGORITHM_VERSION, type LearningEvidenceSnapshot, type LearningObservation } from '../src/learning-evidence';

const observation = (changes: Partial<LearningObservation> = {}): LearningObservation => ({ logicalItemId:'quiz:invariant',conceptId:'hash-maps',score:0,sourceKind:'quiz',occurredAt:'2026-10-26T10:00:00.000Z',sourceId:'a',activityIds:['pairs'],...changes });
const snapshot = (changes: Partial<LearningEvidenceSnapshot> = {}): LearningEvidenceSnapshot => ({algorithmVersion:LEARNING_ALGORITHM_VERSION,generatedAt:'2026-10-29T10:00:00.000Z',optOut:false,concepts:estimateLearningConcepts([observation()]).map(item=>({...item,reviewRevision:1})),recentActivityIds:[],sourceSummary:{releasedQuizItems:1,verifiedPracticeItems:0,independentItems:1},processing:{pending:false,processedSources:1,remainingSources:0},...changes});

describe('versioned account learning estimates',()=>{
  it('shrinks one observed failure toward unknown and expresses uncertainty',()=>{
    expect(estimateLearningConcepts([observation()])[0]).toMatchObject({score:40,confidence:0.2,independentItems:1,evidenceStatus:'limited'});
    const result=estimateLearningConcepts([observation()])[0];
    expect(result.uncertainty.lower).toBeLessThan(result.score);
    expect(result.uncertainty.upper).toBeGreaterThan(result.score);
  });
  it('deduplicates retakes/copies/versions by logical item, independent of replay order',()=>{
    const earlier=observation({sourceId:'old',score:0});
    const later=observation({sourceId:'new',score:100,occurredAt:'2026-10-27T10:00:00.000Z'});
    const expected=estimateLearningConcepts([later]);
    expect(estimateLearningConcepts([earlier,later,earlier,later])).toEqual(expected);
    expect(estimateLearningConcepts([later,earlier])).toEqual(expected);
    expect(expected[0]).toMatchObject({score:60,independentItems:1,confidence:0.2});
  });
  it('compares actual instants for timestamps with offsets',()=>{
    const old=observation({score:0,occurredAt:'2026-10-27T12:00:00+03:00'});
    const newer=observation({score:100,occurredAt:'2026-10-27T10:00:00Z'});
    expect(estimateLearningConcepts([newer,old])[0]).toMatchObject({score:60,lastEvidenceAt:'2026-10-27T10:00:00.000Z'});
  });
  it('ignores invalid observations and reports no fabricated zero without evidence',()=>{
    expect(estimateLearningConcepts([])).toEqual([]);
    expect(estimateLearningConcepts([observation({score:NaN}),observation({score:101}),observation({occurredAt:'invalid'})])).toEqual([]);
  });
  it('increases confidence only with independent coverage, with a lower practice-only ceiling',()=>{
    const items=Array.from({length:100},(_,index)=>observation({logicalItemId:`practice:${index}`,sourceKind:'practice',score:100}));
    expect(estimateLearningConcepts(items)[0].confidence).toBe(0.65);
    expect(estimateLearningConcepts(Array.from({length:100},()=>items[0]))[0].confidence).toBeLessThan(0.2);
    expect(estimateLearningConcepts(items.map(item=>({...item,sourceKind:'quiz'})))[0].confidence).toBe(0.9);
  });
  it('builds deterministic explained plans and demotes recently practiced activities',()=>{
    const catalog=[{practiceId:'pairs',label:'Pair lookup',conceptIds:['hash-maps'],difficulty:'foundation' as const,estimatedMinutes:15},{practiceId:'map-trace',label:'Map trace',conceptIds:['hash-maps'],difficulty:'foundation' as const,estimatedMinutes:10},{practiceId:'graphs',label:'Graph exploration',conceptIds:['graphs'],difficulty:'intermediate' as const,estimatedMinutes:20}];
    const plan=buildLearningPlan(snapshot({recentActivityIds:['pairs']}),catalog);
    expect(plan.recommendations[0]).toMatchObject({practiceId:'map-trace',reasonKind:'recovery',evidenceStatus:'limited'});
    expect(plan.recommendations[0].reason).toContain('1 independent item');
    expect(buildLearningPlan(snapshot({recentActivityIds:['pairs']}),[...catalog].reverse())).toEqual(plan);
  });
  it('supports unknown diagnostic and disabled states without invented mastery',()=>{
    const catalog=[{practiceId:'pairs',label:'Pair lookup',conceptIds:['hash-maps'],difficulty:'foundation' as const,estimatedMinutes:15}];
    expect(buildLearningPlan(snapshot({concepts:[]}),catalog).recommendations[0]).toMatchObject({reasonKind:'diagnostic',evidenceStatus:'unknown'});
    expect(buildLearningPlan(snapshot({optOut:true}),catalog)).toMatchObject({status:'disabled',recommendations:[]});
    expect(buildLearningPlan(snapshot({processing:{pending:true,processedSources:100,remainingSources:1}}),catalog).status).toBe('collecting');
  });
  it('records enough factors and alternatives to reproduce the same ranked plan',()=>{
    const catalog=[{practiceId:'pairs',label:'Pair lookup',conceptIds:['hash-maps'],difficulty:'foundation' as const,estimatedMinutes:15},
      {practiceId:'advanced-pairs',label:'Advanced pairs',conceptIds:['hash-maps','ordering'],difficulty:'advanced' as const,estimatedMinutes:25},
      {practiceId:'graph',label:'Graph traversal',conceptIds:['graphs'],difficulty:'foundation' as const,estimatedMinutes:15},
      {practiceId:'arrays',label:'Array traversal',conceptIds:['arrays'],difficulty:'foundation' as const,estimatedMinutes:10}];
    const input=snapshot({recentActivityIds:['pairs']});
    const decision=buildLearningDecision(input,catalog);
    expect(decision.plan).toEqual(buildLearningPlan(input,catalog));
    expect(decision.candidates.filter(candidate=>candidate.selected)).toHaveLength(3);
    expect(decision.candidates.map(candidate=>candidate.rank)).toEqual([1,2,3,4]);
    for(const candidate of decision.candidates){
      const f=candidate.factors;
      expect(candidate.priority).toBe(f.basePriority+f.dueBonus+f.unknownBonus-f.recentPenalty-f.difficultyPenalty);
    }
    const advanced=decision.candidates.find(candidate=>candidate.activity.practiceId==='advanced-pairs')!;
    expect(advanced.factors).toMatchObject({unknownConceptIds:['ordering'],difficultyPenalty:30,weakestConceptId:'hash-maps'});
    expect(advanced.factors.knownConcepts[0].uncertainty).toEqual(input.concepts[0].uncertainty);
    expect(buildLearningDecision(input,[...catalog].reverse())).toEqual(decision);
    expect(buildLearningDecision(snapshot({optOut:true}),catalog).candidates).toEqual([]);
  });
  it('changes recovery recommendations when demonstrated weaknesses differ',()=>{
    const catalog=[{practiceId:'pairs',label:'Pair lookup',conceptIds:['hash-maps'],difficulty:'foundation' as const,estimatedMinutes:15},
      {practiceId:'graphs',label:'Graph exploration',conceptIds:['graphs'],difficulty:'foundation' as const,estimatedMinutes:20}];
    const estimate=(conceptId:string,score:number)=>({...snapshot().concepts[0],conceptId,score,reviewDueAt:'2026-12-01T00:00:00.000Z'});
    expect(buildLearningDecision(snapshot({concepts:[estimate('hash-maps',40),estimate('graphs',80)]}),catalog).plan.recommendations[0].practiceId).toBe('pairs');
    expect(buildLearningDecision(snapshot({concepts:[estimate('hash-maps',80),estimate('graphs',40)]}),catalog).plan.recommendations[0].practiceId).toBe('graphs');
  });
  it('diagnostic and class copies of one question share independent coverage',()=>{
    const classAnswer=observation({score:0});
    const diagnostic=observation({sourceKind:'diagnostic',score:100,occurredAt:'2026-10-28T10:00:00.000Z',sourceId:'diagnostic-new'});
    expect(estimateLearningConcepts([classAnswer,diagnostic])[0]).toMatchObject({independentItems:1,score:60,confidence:0.2});
    expect(estimateLearningConcepts([classAnswer,diagnostic])).toEqual(estimateLearningConcepts([diagnostic]));
  });
});

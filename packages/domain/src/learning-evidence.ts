/** Account learning estimates are separate from academic grades. */
export const LEARNING_ALGORITHM_VERSION = 'learning-evidence-v1' as const;
export const LEARNING_DECISION_VERSION = 'learning-decision-v1' as const;
export const LEARNING_CURRICULUM_VERSION = 'practice-catalog-v1' as const;

export type LearningPracticeDescriptor = {
  practiceId: string;
  label: string;
  conceptIds: readonly string[];
  difficulty: 'foundation' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  /** Server supplied persisted content ID. Never accept this catalog from a browser. */
  contentId?: string;
};

export type LearningConceptEstimate = {
  conceptId: string;
  score: number;
  confidence: number;
  uncertainty: { lower: number; upper: number };
  evidenceStatus: 'limited' | 'developing' | 'established';
  independentItems: number;
  lastEvidenceAt: string;
  reviewDueAt: string;
  reviewRevision: number;
};

export type LearningEvidenceSnapshot = {
  algorithmVersion: typeof LEARNING_ALGORITHM_VERSION;
  generatedAt: string;
  optOut: boolean;
  concepts: LearningConceptEstimate[];
  recentActivityIds: string[];
  sourceSummary: { releasedQuizItems: number; verifiedPracticeItems: number; diagnosticItems?: number; independentItems: number };
  processing: { pending: boolean; processedSources: number; remainingSources: number };
};

export type LearningRecommendation = {
  practiceId: string;
  label: string;
  conceptIds: string[];
  difficulty: LearningPracticeDescriptor['difficulty'];
  estimatedMinutes: number;
  reason: string;
  reasonKind: 'recovery' | 'review' | 'diagnostic' | 'broaden';
  evidenceStatus: 'unknown' | LearningConceptEstimate['evidenceStatus'];
};

export type LearningPlan = {
  algorithmVersion: typeof LEARNING_ALGORITHM_VERSION;
  status: 'ready' | 'collecting' | 'disabled';
  recommendations: LearningRecommendation[];
};

export type LearningDecisionCandidate = {
  activity: LearningPracticeDescriptor;
  recommendation: LearningRecommendation;
  rank: number;
  selected: boolean;
  priority: number;
  factors: {
    basePriority: number;
    dueBonus: number;
    unknownBonus: number;
    recentPenalty: number;
    difficultyPenalty: number;
    weakestConceptId: string | null;
    knownConcepts: LearningConceptEstimate[];
    unknownConceptIds: string[];
    dueConceptIds: string[];
    recentlyPracticed: boolean;
  };
};

/** A complete server decision can be retained only after an explicit selection. */
export type LearningDecision = {
  decisionVersion: typeof LEARNING_DECISION_VERSION;
  algorithmVersion: typeof LEARNING_ALGORITHM_VERSION;
  curriculumVersion: typeof LEARNING_CURRICULUM_VERSION;
  generatedAt: string;
  plan: LearningPlan;
  candidates: LearningDecisionCandidate[];
};

export type LearningObservation = {
  logicalItemId: string;
  conceptId: string;
  score: number;
  sourceKind: 'quiz' | 'practice' | 'diagnostic';
  occurredAt: string;
  /** Stable tie breaker, so replay order cannot change the estimate. */
  sourceId: string;
  activityIds: string[];
};

/** Retakes and copied/versioned questions replace evidence; they never add independent coverage. */
export function estimateLearningConcepts(observations: readonly LearningObservation[]): Omit<LearningConceptEstimate, 'reviewRevision'>[] {
  const latest = new Map<string, LearningObservation>();
  for (const item of observations) {
    if (!Number.isFinite(item.score) || item.score < 0 || item.score > 100 || !Number.isFinite(Date.parse(item.occurredAt))) continue;
    const key = JSON.stringify([item.conceptId, item.logicalItemId]);
    const previous = latest.get(key);
    if (!previous || Date.parse(item.occurredAt) > Date.parse(previous.occurredAt) || (Date.parse(item.occurredAt) === Date.parse(previous.occurredAt) && item.sourceId > previous.sourceId)) latest.set(key, item);
  }
  const groups = new Map<string, LearningObservation[]>();
  for (const item of latest.values()) groups.set(item.conceptId, [...(groups.get(item.conceptId) ?? []), item]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([conceptId, items]) => {
    let successes = 2, failures = 2;
    for (const item of items) {
      const weight = item.sourceKind === 'practice' ? 0.65 : 1;
      successes += item.score / 100 * weight;
      failures += (1 - item.score / 100) * weight;
    }
    const mean = successes / (successes + failures);
    const deviation = Math.sqrt(successes * failures / ((successes + failures) ** 2 * (successes + failures + 1)));
    const score = Math.round(mean * 100);
    const confidenceCap = items.every(item => item.sourceKind === 'practice') ? 0.65 : 0.9;
    const confidence = Math.round(Math.min(confidenceCap, (successes + failures - 4) / (successes + failures)) * 100) / 100;
    const lastEvidenceAt = new Date(Math.max(...items.map(item => Date.parse(item.occurredAt)))).toISOString();
    const interval = score < 60 ? 1 : score < 80 ? 3 : 7;
    return { conceptId, score, confidence, uncertainty: { lower: Math.max(0, Math.round((mean - 1.96 * deviation) * 100)), upper: Math.min(100, Math.round((mean + 1.96 * deviation) * 100)) },
      evidenceStatus: items.length < 3 ? 'limited' : confidence < 0.65 ? 'developing' : 'established',
      independentItems: items.length, lastEvidenceAt, reviewDueAt: new Date(Date.parse(lastEvidenceAt) + interval * 86_400_000).toISOString() };
  });
}

export function buildLearningPlan(snapshot: LearningEvidenceSnapshot, catalog: readonly LearningPracticeDescriptor[]): LearningPlan {
  return buildLearningDecision(snapshot, catalog).plan;
}

/** Keep every ranking input, including the alternatives, without inventing a proficiency score. */
export function buildLearningDecision(snapshot: LearningEvidenceSnapshot, catalog: readonly LearningPracticeDescriptor[]): LearningDecision {
  const base = { decisionVersion: LEARNING_DECISION_VERSION, algorithmVersion: LEARNING_ALGORITHM_VERSION,
    curriculumVersion: LEARNING_CURRICULUM_VERSION, generatedAt: snapshot.generatedAt };
  if (snapshot.optOut) return { ...base, plan: { algorithmVersion: LEARNING_ALGORITHM_VERSION, status: 'disabled', recommendations: [] }, candidates: [] };
  const concepts = new Map(snapshot.concepts.map(concept => [concept.conceptId, concept]));
  const recent = new Set(snapshot.recentActivityIds);
  const candidates = catalog.map(activity => {
    const known = activity.conceptIds.map(id => concepts.get(id)).filter((value): value is LearningConceptEstimate => Boolean(value));
    const weakest = [...known].sort((a, b) => a.score - b.score || a.conceptId.localeCompare(b.conceptId))[0];
    const due = known.some(value => value.reviewDueAt <= snapshot.generatedAt);
    const unknown = known.length < activity.conceptIds.length;
    const reasonKind: LearningRecommendation['reasonKind'] = weakest && weakest.score < 60 ? 'recovery' : due ? 'review' : unknown || !weakest ? 'diagnostic' : 'broaden';
    const reason = reasonKind === 'recovery' ? `Build ${weakest.conceptId} with targeted practice; the current estimate is ${weakest.score}% from ${weakest.independentItems} independent item${weakest.independentItems === 1 ? '' : 's'}.`
      : reasonKind === 'review' ? 'A delayed review is due for concepts you have practiced.'
        : reasonKind === 'diagnostic' ? 'Build initial evidence for concepts with limited or unknown coverage.' : 'Broaden your evidence with another practice activity.';
    const factors = {
      basePriority: weakest ? 100 - weakest.score : 45,
      dueBonus: due ? 25 : 0, unknownBonus: unknown ? 10 : 0,
      recentPenalty: recent.has(activity.practiceId) ? 45 : 0,
      difficultyPenalty: activity.difficulty === 'advanced' && (!weakest || weakest.score < 65) ? 30 : 0,
      weakestConceptId: weakest?.conceptId ?? null,
      knownConcepts: [...known].sort((a,b) => a.conceptId.localeCompare(b.conceptId)).map(concept => ({ ...concept, uncertainty: { ...concept.uncertainty } })),
      unknownConceptIds: activity.conceptIds.filter(id => !concepts.has(id)).sort(),
      dueConceptIds: known.filter(concept => concept.reviewDueAt <= snapshot.generatedAt).map(concept => concept.conceptId).sort(),
      recentlyPracticed: recent.has(activity.practiceId),
    };
    const priority = factors.basePriority + factors.dueBonus + factors.unknownBonus - factors.recentPenalty - factors.difficultyPenalty;
    return { priority, factors, activity: { ...activity, conceptIds: [...activity.conceptIds] },
      recommendation: { practiceId: activity.practiceId, label: activity.label, conceptIds: [...activity.conceptIds], difficulty: activity.difficulty, estimatedMinutes: activity.estimatedMinutes,
        reason, reasonKind, evidenceStatus: weakest?.evidenceStatus ?? 'unknown' } satisfies LearningRecommendation };
  });
  const ranked = candidates.sort((a,b) => b.priority - a.priority || a.activity.practiceId.localeCompare(b.activity.practiceId))
    .map((candidate,index) => ({ ...candidate, rank: index + 1, selected: index < 3 }));
  return { ...base, candidates: ranked, plan: { algorithmVersion: LEARNING_ALGORITHM_VERSION, status: snapshot.processing.pending ? 'collecting' : 'ready',
    recommendations: ranked.slice(0,3).map(candidate => candidate.recommendation) } };
}

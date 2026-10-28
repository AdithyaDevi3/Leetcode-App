/** Account learning estimates are separate from academic grades. */
export const LEARNING_ALGORITHM_VERSION = 'learning-evidence-v1' as const;

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
  sourceSummary: { releasedQuizItems: number; verifiedPracticeItems: number; independentItems: number };
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

export type LearningObservation = {
  logicalItemId: string;
  conceptId: string;
  score: number;
  sourceKind: 'quiz' | 'practice';
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
  if (snapshot.optOut) return { algorithmVersion: LEARNING_ALGORITHM_VERSION, status: 'disabled', recommendations: [] };
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
    const priority = (weakest ? 100 - weakest.score : 45) + (due ? 25 : 0) + (unknown ? 10 : 0) - (recent.has(activity.practiceId) ? 45 : 0) - (activity.difficulty === 'advanced' && (!weakest || weakest.score < 65) ? 30 : 0);
    return { priority, value: { practiceId: activity.practiceId, label: activity.label, conceptIds: [...activity.conceptIds], difficulty: activity.difficulty, estimatedMinutes: activity.estimatedMinutes,
      reason, reasonKind, evidenceStatus: weakest?.evidenceStatus ?? 'unknown' } satisfies LearningRecommendation };
  });
  return { algorithmVersion: LEARNING_ALGORITHM_VERSION, status: snapshot.processing.pending ? 'collecting' : 'ready',
    recommendations: candidates.sort((a, b) => b.priority - a.priority || a.value.practiceId.localeCompare(b.value.practiceId)).slice(0, 3).map(value => value.value) };
}

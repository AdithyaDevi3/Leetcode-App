export type MasteryEvidence = {
  conceptId: string;
  score: number;
  confidence: number;
  occurredAt: string;
  weight?: number;
};

export type ConceptMastery = {
  conceptId: string;
  score: number;
  confidence: number;
  updatedAt: string;
};

export function updateConceptMastery(current: ConceptMastery | null, evidence: MasteryEvidence): ConceptMastery {
  if (evidence.score < 0 || evidence.score > 100 || evidence.confidence < 0 || evidence.confidence > 1) {
    throw new Error('Evidence score or confidence is out of range');
  }
  const evidenceWeight = Math.max(0.05, Math.min(1, evidence.weight ?? evidence.confidence));
  const priorWeight = current ? Math.max(0.05, Math.min(1, current.confidence)) : 0;
  const score = current
    ? Math.round((current.score * priorWeight + evidence.score * evidenceWeight) / (priorWeight + evidenceWeight))
    : Math.round(evidence.score);
  return {
    conceptId: evidence.conceptId,
    score,
    confidence: Math.min(1, priorWeight + evidenceWeight),
    updatedAt: evidence.occurredAt,
  };
}

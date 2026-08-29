export type RecommendationCandidate = { contentId: string; prerequisiteReady: boolean; masteryGap: number; reviewDue: boolean; recentlySeen: boolean; estimatedMinutes: number };
export type Recommendation = { contentId: string; score: number; reasons: string[] };

export function recommendNextActivity(candidates: RecommendationCandidate[]): Recommendation | null {
  const ranked = candidates.filter((candidate) => candidate.prerequisiteReady).map((candidate) => {
    const score = candidate.masteryGap + (candidate.reviewDue ? 30 : 0) - (candidate.recentlySeen ? 25 : 0) - Math.min(20, candidate.estimatedMinutes);
    const reasons = [candidate.reviewDue ? 'Review is due' : 'Builds a current skill gap', candidate.masteryGap >= 50 ? 'Targets a weak concept' : 'Supports continued practice'];
    return { contentId: candidate.contentId, score, reasons };
  }).sort((a, b) => b.score - a.score || a.contentId.localeCompare(b.contentId));
  return ranked[0] ?? null;
}

export type ReviewState = { conceptId: string; intervalDays: number; dueAt: string; repetitions: number };

export function scheduleReview(current: ReviewState | null, conceptId: string, score: number, completedAt: string): ReviewState {
  if (score < 0 || score > 100) throw new Error('Review score is out of range');
  const success = score >= 70;
  const intervalDays = success ? Math.min(60, Math.max(1, (current?.intervalDays ?? 1) * 2)) : 1;
  const repetitions = success ? (current?.repetitions ?? 0) + 1 : 0;
  const due = new Date(completedAt);
  due.setUTCDate(due.getUTCDate() + intervalDays);
  return { conceptId: current?.conceptId ?? conceptId, intervalDays, repetitions, dueAt: due.toISOString() };
}

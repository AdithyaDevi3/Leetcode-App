import type { LocalPracticeHistoryEntry } from './local-practice-history';

export type LearningProgressSummary = {
  completedItems: number;
  averageScore: number | null;
  activeDays: number;
  currentStreak: number;
  latestCompletion: string | null;
};

const dayKey = (value: string | Date): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/** Derive learner-facing progress from the durable completion history.
 * Streaks are UTC-calendar based and only remain current through today or yesterday.
 */
export function summarizeLearningProgress(entries: LocalPracticeHistoryEntry[], asOf = new Date()): LearningProgressSummary {
  const validEntries = entries
    .filter((entry) => dayKey(entry.completedAt))
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());
  const days = [...new Set(validEntries.map((entry) => dayKey(entry.completedAt)))].sort().reverse();
  const scores = validEntries
    .map((entry) => entry.evaluationScore)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

  const today = dayKey(asOf);
  const latestDay = days[0];
  const daysSinceLatest = latestDay
    ? (new Date(`${today}T00:00:00.000Z`).getTime() - new Date(`${latestDay}T00:00:00.000Z`).getTime()) / 86_400_000
    : Infinity;
  let currentStreak = daysSinceLatest >= 0 && daysSinceLatest <= 1 ? 1 : 0;
  for (let index = 1; currentStreak > 0 && index < days.length; index += 1) {
    const previous = new Date(`${days[index - 1]}T00:00:00.000Z`);
    const current = new Date(`${days[index]}T00:00:00.000Z`);
    if ((previous.getTime() - current.getTime()) / 86_400_000 !== 1) break;
    currentStreak += 1;
  }

  return {
    completedItems: validEntries.length,
    averageScore: scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : null,
    activeDays: days.length,
    currentStreak,
    latestCompletion: validEntries[0]?.completedAt ?? null,
  };
}

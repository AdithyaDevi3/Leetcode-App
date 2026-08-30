import type { LocalPracticeHistoryEntry } from './local-practice-history';

export type LearningProgressSummary = {
  completedItems: number;
  averageScore: number | null;
  activeDays: number;
  currentStreak: number;
  latestCompletion: string | null;
};

const dayKey = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

/** Derive learner-facing progress from the durable completion history. */
export function summarizeLearningProgress(entries: LocalPracticeHistoryEntry[]): LearningProgressSummary {
  const validEntries = entries
    .filter((entry) => dayKey(entry.completedAt))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  const days = [...new Set(validEntries.map((entry) => dayKey(entry.completedAt)))].sort().reverse();
  const scores = validEntries
    .map((entry) => entry.evaluationScore)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

  let currentStreak = 0;
  for (let index = 0; index < days.length; index += 1) {
    if (index === 0) {
      currentStreak = 1;
      continue;
    }
    const previous = new Date(`${days[index - 1]}T00:00:00.000Z`);
    const current = new Date(`${days[index]}T00:00:00.000Z`);
    const difference = (previous.getTime() - current.getTime()) / 86_400_000;
    if (difference !== 1) break;
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

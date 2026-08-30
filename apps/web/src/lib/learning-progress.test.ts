import { describe, expect, it } from 'vitest';
import { summarizeLearningProgress } from './learning-progress';

describe('summarizeLearningProgress', () => {
  it('summarizes completed items, scores, active days, and consecutive days', () => {
    const summary = summarizeLearningProgress([
      { practiceItemId: 'a', label: 'A', completedAt: '2026-08-30T10:00:00Z', evaluationScore: 80 },
      { practiceItemId: 'b', label: 'B', completedAt: '2026-08-29T10:00:00Z', evaluationScore: 90 },
      { practiceItemId: 'c', label: 'C', completedAt: '2026-08-27T10:00:00Z', evaluationScore: null },
    ]);
    expect(summary).toEqual({ completedItems: 3, averageScore: 85, activeDays: 3, currentStreak: 2, latestCompletion: '2026-08-30T10:00:00Z' });
  });

  it('handles empty and malformed timestamps without inventing progress', () => {
    expect(summarizeLearningProgress([])).toMatchObject({ completedItems: 0, averageScore: null, activeDays: 0, currentStreak: 0, latestCompletion: null });
    expect(summarizeLearningProgress([{ practiceItemId: 'x', label: 'X', completedAt: 'not-a-date', evaluationScore: 100 }])).toMatchObject({ completedItems: 0, averageScore: null, activeDays: 0, currentStreak: 0, latestCompletion: null });
  });
});

import { describe, expect, it } from 'vitest';
import { upsertLocalPracticeHistory, type LocalPracticeHistoryEntry } from './local-practice-history';

const first: LocalPracticeHistoryEntry = {
  practiceItemId: 'pair-with-target-v1',
  label: 'Pair with target',
  completedAt: '2026-08-30T10:00:00.000Z',
  evaluationScore: 84,
};

describe('local practice history', () => {
  it('adds a completion to an empty history', () => {
    expect(upsertLocalPracticeHistory([], first)).toEqual([first]);
  });

  it('keeps only the latest completion for a practice item', () => {
    const latest = { ...first, completedAt: '2026-08-30T11:00:00.000Z', evaluationScore: 96 };
    expect(upsertLocalPracticeHistory([first], latest)).toEqual([latest]);
  });
});

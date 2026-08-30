export type LocalPracticeHistoryEntry = {
  practiceItemId: string;
  label: string;
  completedAt: string;
  evaluationScore: number | null;
};

export const localPracticeHistoryKey = 'leetcode-app.local-practice-history.v1';

export function upsertLocalPracticeHistory(
  history: LocalPracticeHistoryEntry[],
  entry: LocalPracticeHistoryEntry,
): LocalPracticeHistoryEntry[] {
  return [entry, ...history.filter((candidate) => candidate.practiceItemId !== entry.practiceItemId)];
}

export function readLocalPracticeHistory(): LocalPracticeHistoryEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(localPracticeHistoryKey) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry): entry is LocalPracticeHistoryEntry => (
      typeof entry?.practiceItemId === 'string' &&
      typeof entry.label === 'string' &&
      typeof entry.completedAt === 'string' &&
      (typeof entry.evaluationScore === 'number' || entry.evaluationScore === null)
    ));
  } catch {
    return [];
  }
}

export function recordLocalPracticeCompletion(entry: Omit<LocalPracticeHistoryEntry, 'completedAt'>): void {
  if (typeof window === 'undefined') return;

  const updated = upsertLocalPracticeHistory(readLocalPracticeHistory(), {
    ...entry,
    completedAt: new Date().toISOString(),
  });
  window.localStorage.setItem(localPracticeHistoryKey, JSON.stringify(updated));
}

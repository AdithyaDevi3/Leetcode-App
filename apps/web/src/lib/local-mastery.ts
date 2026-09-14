import type { PracticeItem } from './content';
import { readBrowserStorage, writeBrowserStorage } from './safe-browser-storage';

export type LocalConceptMastery = {
  conceptId: string;
  mastery: number;
  confidence: number;
  evidenceCount: number;
  lastPracticedAt: string;
};

export type LocalMasteryState = Record<string, LocalConceptMastery>;

export const localMasteryKey = 'method:local-mastery:v1';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function readLocalMastery(): LocalMasteryState {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(readBrowserStorage(localMasteryKey) ?? '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<LocalConceptMastery>;
      return typeof candidate.conceptId === 'string'
        && typeof candidate.mastery === 'number'
        && typeof candidate.confidence === 'number'
        && typeof candidate.evidenceCount === 'number'
        && typeof candidate.lastPracticedAt === 'string';
    })) as LocalMasteryState;
  } catch {
    return {};
  }
}

export function recordLocalPracticeEvidence(input: {
  item: PracticeItem;
  reasoningScore: number;
  codeScore?: number;
  practicedAt?: string;
}): LocalMasteryState {
  const current = readLocalMastery();
  const practicedAt = input.practicedAt ?? new Date().toISOString();
  const reasoning = clamp(input.reasoningScore / 100);
  const observed = input.codeScore === undefined
    ? reasoning
    : reasoning * 0.4 + clamp(input.codeScore / 100) * 0.6;

  const next = { ...current };
  for (const conceptId of input.item.conceptIds) {
    const previous = current[conceptId];
    const evidenceCount = (previous?.evidenceCount ?? 0) + 1;
    const priorWeight = Math.min(8, previous?.evidenceCount ?? 0);
    const mastery = previous
      ? ((previous.mastery * priorWeight) + observed) / (priorWeight + 1)
      : observed;
    next[conceptId] = {
      conceptId,
      mastery: clamp(mastery),
      confidence: clamp(1 - Math.exp(-evidenceCount / 4)),
      evidenceCount,
      lastPracticedAt: practicedAt,
    };
  }

  writeBrowserStorage(localMasteryKey, JSON.stringify(next));
  return next;
}

export function itemMastery(item: PracticeItem, mastery: LocalMasteryState): number | null {
  const evidence = item.conceptIds.map((conceptId) => mastery[conceptId]).filter(Boolean);
  if (evidence.length === 0) return null;
  const weighted = evidence.reduce((total, entry) => total + entry.mastery * entry.confidence, 0);
  const confidence = evidence.reduce((total, entry) => total + entry.confidence, 0);
  return confidence > 0 ? weighted / confidence : null;
}

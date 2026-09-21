import type { RoadmapAnswer } from './roadmap-evaluation';

export type RoadmapProgress = Record<string, { answer: RoadmapAnswer; ready: boolean; updatedAt: string }>;
const storageKey = 'method-roadmap-progress-v1';

export function readRoadmapProgress(): RoadmapProgress {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry) => {
      const record = entry[1] as Partial<RoadmapProgress[string]> | null;
      return record && typeof record === 'object' && typeof record.ready === 'boolean'
        && typeof record.updatedAt === 'string' && typeof record.answer?.approach === 'string'
        && typeof record.answer.edgeCase === 'string' && typeof record.answer.complexity === 'string';
    })) as RoadmapProgress;
  } catch { return {}; }
}

export function writeRoadmapProgress(progress: RoadmapProgress): void {
  window.localStorage.setItem(storageKey, JSON.stringify(progress));
}

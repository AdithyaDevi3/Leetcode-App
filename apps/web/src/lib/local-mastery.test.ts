import { beforeEach, describe, expect, it, vi } from 'vitest';

import { practiceItems } from './content';
import { itemMastery, readLocalMastery, recordLocalPracticeEvidence } from './local-mastery';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
  vi.stubGlobal('window', { localStorage });
  vi.stubGlobal('localStorage', localStorage);
});

describe('local concept mastery', () => {
  it('records combined reasoning and verified-code evidence by concept', () => {
    const item = practiceItems[0];
    const state = recordLocalPracticeEvidence({ item, reasoningScore: 100, codeScore: 50, practicedAt: '2026-09-13T12:00:00.000Z' });
    expect(state['hash-maps']).toMatchObject({ mastery: 0.7, evidenceCount: 1 });
    expect(readLocalMastery()['complement-reasoning']).toBeDefined();
    expect(itemMastery(item, state)).toBeCloseTo(0.7);
  });

  it('accumulates evidence instead of replacing it', () => {
    const item = practiceItems[0];
    recordLocalPracticeEvidence({ item, reasoningScore: 100, codeScore: 100 });
    const state = recordLocalPracticeEvidence({ item, reasoningScore: 0, codeScore: 0 });
    expect(state['hash-maps'].evidenceCount).toBe(2);
    expect(state['hash-maps'].mastery).toBeCloseTo(0.5);
  });
});

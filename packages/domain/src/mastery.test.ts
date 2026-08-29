import { describe, expect, it } from 'vitest';
import { updateConceptMastery } from './mastery';

describe('concept mastery', () => {
  it('creates mastery from evidence and updates it with weighted evidence', () => {
    const initial = updateConceptMastery(null, { conceptId: 'hashing', score: 80, confidence: 0.7, occurredAt: '2026-08-29T00:00:00Z' });
    const next = updateConceptMastery(initial, { conceptId: 'hashing', score: 100, confidence: 0.3, occurredAt: '2026-08-30T00:00:00Z' });
    expect(initial.score).toBe(80);
    expect(next).toMatchObject({ conceptId: 'hashing', score: 86, confidence: 1 });
  });
  it('rejects invalid evidence', () => {
    expect(() => updateConceptMastery(null, { conceptId: 'hashing', score: 101, confidence: 1, occurredAt: '2026-08-29T00:00:00Z' })).toThrow('out of range');
  });
});

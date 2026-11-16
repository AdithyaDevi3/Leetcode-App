import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch3 } from './questions-batch-3';

describe('original coding question batch 3', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch3).toHaveLength(20);
    expect(new Set(originalCoding250Batch3.map(question => question.id)).size).toBe(20);
    for (const question of originalCoding250Batch3) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-v3' } });
      expect(question.constraints.length).toBeGreaterThan(0);
      expect(question.examples.length).toBeGreaterThan(0);
      expect(question.functionName).toMatch(/^[A-Za-z_]/);
    }
  });

  it('covers the planned late-roadmap coding topics', () => {
    expect(new Set(originalCoding250Batch3.map(question => question.topic))).toEqual(new Set([
      'dynamic-programming-1d', 'dynamic-programming-2d', 'greedy', 'intervals', 'bit-manipulation', 'math-geometry',
    ]));
  });
});

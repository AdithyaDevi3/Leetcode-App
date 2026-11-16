import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch6 } from './questions-batch-6';

describe('original coding question batch 6', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch6).toHaveLength(20);
    expect(new Set(originalCoding250Batch6.map(question => question.id)).size).toBe(20);
    for (const question of originalCoding250Batch6) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-6' } });
      expect(question.examples).toHaveLength(1);
      expect(question.functionName).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    }
  });

  it('covers dynamic programming through math and geometry', () => {
    expect(new Set(originalCoding250Batch6.map(question => question.topic))).toEqual(new Set([
      'dynamic-programming-1d', 'dynamic-programming-2d', 'greedy', 'intervals', 'bit-manipulation', 'math-geometry',
    ]));
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch8 } from './questions-batch-8';

describe('original coding question batch 8', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch8).toHaveLength(20);
    expect(new Set(originalCoding250Batch8.map(question => question.id)).size).toBe(20);
    expect(new Set(originalCoding250Batch8.map(question => question.functionName)).size).toBe(20);
    for (const question of originalCoding250Batch8) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-8' } });
      expect(question.examples).toHaveLength(1);
      expect(question.constraints.length).toBeGreaterThan(0);
    }
  });

  it('covers complementary coding-roadmap topics', () => {
    expect(new Set(originalCoding250Batch8.map(question => question.topic))).toEqual(new Set([
      'arrays-hashing', 'two-pointers', 'sliding-window', 'binary-search', 'linked-lists', 'stacks', 'trees', 'tries', 'backtracking', 'heaps', 'graphs', 'advanced-graphs', 'dynamic-programming-1d',
    ]));
  });
});

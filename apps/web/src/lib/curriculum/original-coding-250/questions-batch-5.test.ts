import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch5 } from './questions-batch-5';

describe('original coding question batch 5', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch5).toHaveLength(20);
    expect(new Set(originalCoding250Batch5.map(question => question.id)).size).toBe(20);
    expect(new Set(originalCoding250Batch5.map(question => question.functionName)).size).toBe(20);
    for (const question of originalCoding250Batch5) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-5' } });
      expect(question.examples).toHaveLength(1);
      expect(question.constraints.length).toBeGreaterThan(0);
    }
  });

  it('covers each assigned coding-roadmap topic', () => {
    expect(new Set(originalCoding250Batch5.map(question => question.topic))).toEqual(new Set([
      'trees', 'tries', 'backtracking', 'heaps', 'graphs', 'advanced-graphs',
    ]));
  });
});

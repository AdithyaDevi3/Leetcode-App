import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { originalCoding250Batch7 } from './questions-batch-7';

describe('original coding question batch 7', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch7).toHaveLength(20);
    expect(new Set(originalCoding250Batch7.map(question => question.id)).size).toBe(20);
    for (const question of originalCoding250Batch7) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-7' } });
      expect(question.examples).toHaveLength(1);
      expect(question.constraints.length).toBeGreaterThan(0);
    }
  });

  it('covers coding topics across the original map', () => {
    expect(new Set(originalCoding250Batch7.map(question => question.topic))).toEqual(new Set([
      'arrays-hashing', 'two-pointers', 'sliding-window', 'binary-search', 'linked-lists', 'stacks', 'trees', 'graphs', 'dynamic-programming-1d', 'greedy',
    ]));
  });
});

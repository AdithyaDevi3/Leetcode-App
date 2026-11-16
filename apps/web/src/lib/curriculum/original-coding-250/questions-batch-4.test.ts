import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch4 } from './questions-batch-4';

describe('original coding question batch 4', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch4).toHaveLength(20);
    expect(new Set(originalCoding250Batch4.map(question => question.id)).size).toBe(20);
    for (const question of originalCoding250Batch4) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-4' } });
      expect(question.examples).toHaveLength(1);
      expect(question.constraints.length).toBeGreaterThan(0);
    }
  });

  it('covers the first six original coding-roadmap topics', () => {
    expect(new Set(originalCoding250Batch4.map(question => question.topic))).toEqual(new Set([
      'arrays-hashing', 'two-pointers', 'sliding-window', 'binary-search', 'linked-lists', 'stacks',
    ]));
  });
});

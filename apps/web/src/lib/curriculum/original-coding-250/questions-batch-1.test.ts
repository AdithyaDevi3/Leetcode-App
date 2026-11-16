import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Batch1 } from './questions-batch-1';

describe('original coding question batch 1', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch1).toHaveLength(20);
    expect(new Set(originalCoding250Batch1.map(question => question.id)).size).toBe(20);
    for (const question of originalCoding250Batch1) {
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-250-author-batch-1' } });
      expect(question.constraints.length).toBeGreaterThan(0);
      expect(question.examples.length).toBeGreaterThan(0);
      expect(question.functionName).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    }
  });

  it('covers the first six original coding-roadmap topics', () => {
    expect(new Set(originalCoding250Batch1.map(question => question.topic))).toEqual(new Set([
      'arrays-hashing', 'two-pointers', 'sliding-window', 'binary-search', 'linked-lists', 'stacks',
    ]));
  });
});

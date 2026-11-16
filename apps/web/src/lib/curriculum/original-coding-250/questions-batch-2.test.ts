import { describe, expect, it } from 'vitest';
import { freezeOriginalCodingQuestion } from '@leetcode-app/domain';
import { originalCoding250Batch2 } from './questions-batch-2';

describe('original coding question batch 2', () => {
  it('contains twenty original review-gated coding questions', () => {
    expect(originalCoding250Batch2).toHaveLength(20);
    expect(new Set(originalCoding250Batch2.map(question => question.id)).size).toBe(20);
    for (const question of originalCoding250Batch2) {
      expect(freezeOriginalCodingQuestion(question)).toEqual(question);
      expect(question).toMatchObject({ status: 'in_review', reviewerId: null, provenance: { kind: 'original', authorId: 'original-coding-catalog-author-b2' } });
      expect(question.examples.length).toBeGreaterThan(0);
      expect(question.constraints.length).toBeGreaterThan(0);
    }
  });

  it('covers the planned search and graph topics', () => {
    const topics = new Set(originalCoding250Batch2.map(question => question.topic));
    for (const topic of ['trees', 'tries', 'backtracking', 'heaps', 'graphs', 'advanced-graphs']) expect(topics.has(topic)).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch3Questions, interviewCore250Batch3Topics } from './questions-batch-3';

describe('interview core batch 3 questions', () => {
  it('provides twenty unique original questions in high-allocation topics', () => {
    expect(interviewCore250Batch3Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch3Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch3Topics) expect(interviewCore250Batch3Questions.some(question => question.conceptIds[0] === topic)).toBe(true);
  });

  it('keeps all batch items review-gated and learner projections safe', () => {
    for (const question of interviewCore250Batch3Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v3' } });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

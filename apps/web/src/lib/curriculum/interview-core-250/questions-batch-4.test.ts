import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch4Questions, interviewCore250Batch4Topics } from './questions-batch-4';

describe('interview core batch 4 questions', () => {
  it('provides twenty unique original questions in the priority topics', () => {
    expect(interviewCore250Batch4Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch4Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch4Topics) {
      expect(interviewCore250Batch4Questions.some(question => question.conceptIds[0] === topic)).toBe(true);
    }
  });

  it('keeps all batch items review-gated and learner projections safe', () => {
    for (const question of interviewCore250Batch4Questions) {
      expect(question).toMatchObject({
        status: 'in_review',
        review: null,
        provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v4' },
      });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

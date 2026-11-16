import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch8Questions, interviewCore250Batch8Topics } from './questions-batch-8';

describe('interview core batch 8 questions', () => {
  it('provides twenty unique original questions across its selected topics', () => {
    expect(interviewCore250Batch8Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch8Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch8Topics) {
      expect(interviewCore250Batch8Questions.some(question => question.conceptIds[0] === topic)).toBe(true);
    }
  });

  it('keeps answers and explanations out of learner projections', () => {
    for (const question of interviewCore250Batch8Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v8' } });
      const learnerQuestion = JSON.stringify(toLearnerQuestion(question));
      expect(learnerQuestion).not.toContain('correctOptionId');
      expect(learnerQuestion).not.toContain('explanation');
    }
  });
});

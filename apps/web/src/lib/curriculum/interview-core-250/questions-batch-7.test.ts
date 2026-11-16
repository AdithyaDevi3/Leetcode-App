import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch7Questions, interviewCore250Batch7Topics } from './questions-batch-7';

describe('interview core batch 7 questions', () => {
  it('provides twenty unique original questions in the selected topics', () => {
    expect(interviewCore250Batch7Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch7Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch7Topics) {
      expect(interviewCore250Batch7Questions.filter(question => question.conceptIds[0] === topic)).not.toHaveLength(0);
    }
  });

  it('keeps all items review-gated and learner projections safe', () => {
    for (const question of interviewCore250Batch7Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v7' } });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

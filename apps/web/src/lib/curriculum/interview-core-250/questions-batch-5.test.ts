import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch5Questions, interviewCore250Batch5Topics } from './questions-batch-5';

describe('interview core batch 5 questions', () => {
  it('provides twenty unique original questions across its declared topics', () => {
    expect(interviewCore250Batch5Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch5Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch5Topics) expect(interviewCore250Batch5Questions.some(question => question.conceptIds[0] === topic)).toBe(true);
  });

  it('keeps answer details out of learner projections', () => {
    for (const question of interviewCore250Batch5Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v5' } });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

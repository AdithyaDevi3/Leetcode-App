import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch9Questions, interviewCore250Batch9Topics } from './questions-batch-9';

describe('interview core batch 9 questions', () => {
  it('provides twenty unique original questions in the selected topics', () => {
    expect(interviewCore250Batch9Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch9Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch9Topics) {
      expect(interviewCore250Batch9Questions.filter(question => question.conceptIds[0] === topic)).not.toHaveLength(0);
    }
  });

  it('keeps all items review-gated and learner projections safe', () => {
    for (const question of interviewCore250Batch9Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v9' } });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

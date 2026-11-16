import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch11Questions, interviewCore250Batch11Topics } from './questions-batch-11';

describe('interview core batch 11 questions', () => {
  it('provides twenty unique original questions in the selected topics', () => {
    expect(interviewCore250Batch11Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch11Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch11Topics) expect(interviewCore250Batch11Questions.filter(question => question.conceptIds[0] === topic)).not.toHaveLength(0);
  });

  it('keeps all items review-gated and learner projections safe', () => {
    for (const question of interviewCore250Batch11Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v11' } });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

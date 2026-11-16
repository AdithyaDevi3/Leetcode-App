import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import { interviewCore250Batch2Questions, interviewCore250Batch2Topics } from './questions-batch-2';

describe('interview core batch 2 questions', () => {
  it('provides twenty unique original in-review questions', () => {
    expect(interviewCore250Batch2Questions).toHaveLength(20);
    expect(new Set(interviewCore250Batch2Questions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Batch2Topics) {
      expect(interviewCore250Batch2Questions.filter(question => question.conceptIds[0] === topic)).toHaveLength(2);
    }
  });

  it('keeps review-gated metadata and learner projections safe', () => {
    for (const question of interviewCore250Batch2Questions) {
      expect(question).toMatchObject({ status: 'in_review', review: null, provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v2' } });
      expect(question.options.find(option => option.id === question.correctOptionId)?.misconceptionTags).toEqual([]);
      const learner = toLearnerQuestion(question);
      expect(JSON.stringify(learner)).not.toContain('correctOptionId');
      expect(JSON.stringify(learner)).not.toContain('explanation');
    }
  });
});

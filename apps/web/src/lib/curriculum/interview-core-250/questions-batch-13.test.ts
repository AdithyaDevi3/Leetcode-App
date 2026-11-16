import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));

import {
  interviewCore250Batch13Questions,
  interviewCore250Batch13Topics,
} from './questions-batch-13';

describe('interview core batch 13 questions', () => {
  it('provides ten unique original questions in the selected topics', () => {
    expect(interviewCore250Batch13Questions).toHaveLength(10);
    expect(new Set(interviewCore250Batch13Questions.map(question => question.questionId)).size).toBe(10);
    for (const topic of interviewCore250Batch13Topics) {
      expect(interviewCore250Batch13Questions.filter(question => question.conceptIds[0] === topic)).not.toHaveLength(0);
    }
  });

  it('keeps all items review-gated and learner projections safe', () => {
    for (const question of interviewCore250Batch13Questions) {
      expect(question).toMatchObject({
        status: 'in_review',
        review: null,
        provenance: { kind: 'original', authorId: 'interview-core-250-original-author-v13' },
      });
      const learner = JSON.stringify(toLearnerQuestion(question));
      expect(learner).not.toContain('correctOptionId');
      expect(learner).not.toContain('explanation');
    }
  });
});

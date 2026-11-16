import { describe, expect, it, vi } from 'vitest';
import { toLearnerQuestion } from '@leetcode-app/domain';

vi.mock('server-only', () => ({}));
import {
  interviewCore250SeedQuestions,
  interviewCore250SeedTopicByQuestionId,
  interviewCore250Topics,
} from './questions';

describe('interview core 250 seed questions', () => {
  it('provides original in-review questions across selected missing topics', () => {
    expect(interviewCore250SeedQuestions).toHaveLength(20);
    expect(new Set(interviewCore250SeedQuestions.map(question => question.questionId)).size).toBe(20);
    for (const topic of interviewCore250Topics) {
      const questions = interviewCore250SeedQuestions.filter(question => question.conceptIds[0] === topic);
      expect(questions.length).toBeGreaterThan(0);
    }
  });

  it('keeps the review gate and original provenance intact', () => {
    for (const question of interviewCore250SeedQuestions) {
      expect(question.status).toBe('in_review');
      expect(question.review).toBeNull();
      expect(question.provenance).toMatchObject({ kind: 'original', authorId: 'interview-core-250-original-author-v1' });
      expect(question.options.filter(option => option.id === question.correctOptionId)).toHaveLength(1);
      expect(question.conceptIds).toContain(interviewCore250SeedTopicByQuestionId[question.questionId]);
    }
  });

  it('does not expose answer keys or explanations in learner projections', () => {
    for (const question of interviewCore250SeedQuestions) {
      const learner = toLearnerQuestion(question);
      expect(Object.keys(learner).sort()).toEqual([
        'activityIds', 'conceptIds', 'difficulty', 'kind', 'options', 'prompt',
        'questionId', 'title', 'version', 'versionId',
      ]);
      expect(learner.options.every(option => Object.keys(option).sort().join(',') === 'id,text')).toBe(true);
    }
  });
});

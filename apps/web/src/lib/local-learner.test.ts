import { describe, expect, it } from 'vitest';
import { buildLocalLearningPlan, defaultLocalLearnerProfile } from './local-learner';

describe('local learner plan', () => {
  it('recommends foundational topics for a new interview learner', () => {
    expect(buildLocalLearningPlan(defaultLocalLearnerProfile)).toMatchObject({
      pace: 'standard', suggestedTopics: ['arrays', 'hashing', 'two-pointers'],
    });
  });

  it('adapts pace and topics for an experienced learner', () => {
    expect(buildLocalLearningPlan({ ...defaultLocalLearnerProfile, experience: 'experienced', weeklyMinutes: 360 })).toMatchObject({
      pace: 'intensive', suggestedTopics: ['graphs', 'dynamic-programming', 'system-design'],
    });
  });
});

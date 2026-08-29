import { describe, expect, it } from 'vitest';
import { buildInitialLearningPlan, validateLearnerProfile } from './onboarding';

const profile = { goal: 'interview' as const, experience: 'new' as const, preferredLanguage: 'typescript' as const, weeklyMinutes: 90, timezone: 'America/New_York', diagnosticOptIn: true };
describe('learner onboarding', () => {
  it('validates profile inputs and creates an explainable plan', () => {
    expect(validateLearnerProfile(profile)).toEqual([]);
    expect(buildInitialLearningPlan(profile)).toMatchObject({ pace: 'light', suggestedTopics: ['arrays', 'hashing', 'two-pointers'] });
  });
  it('rejects unsafe availability or missing timezone', () => {
    expect(validateLearnerProfile({ ...profile, weeklyMinutes: 0, timezone: '' })).toHaveLength(2);
  });
});

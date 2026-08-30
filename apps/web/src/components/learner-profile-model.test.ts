import { describe, expect, it } from 'vitest';
import { isLearnerProfile, profileForEditor, profilePayload, type LearnerProfile } from './learner-profile-model';

const profile: LearnerProfile = {
  goal: 'interview', experience: 'some', preferredLanguage: 'typescript', weeklyMinutes: 180,
  timezone: 'America/New_York', diagnosticOptIn: true, targetDate: '2026-10-18T00:00:00.000Z', accessibilityNotes: '  Larger text  ', personalizationOptOut: true,
};

describe('learner profile model', () => {
  it('prepares optional persisted values for accessible form controls', () => {
    expect(profileForEditor({ ...profile, targetDate: undefined, accessibilityNotes: undefined })).toMatchObject({ targetDate: '', accessibilityNotes: '', personalizationOptOut: true });
  });

  it('normalizes optional values before profile writes', () => {
    expect(profilePayload(profile)).toMatchObject({ targetDate: '2026-10-18', accessibilityNotes: 'Larger text', personalizationOptOut: true });
    expect(profilePayload({ ...profile, targetDate: ' ', accessibilityNotes: ' ' })).not.toHaveProperty('targetDate');
  });

  it('recognizes a complete profile response', () => {
    expect(isLearnerProfile(profile)).toBe(true);
    expect(isLearnerProfile({ goal: 'interview' })).toBe(false);
  });
});

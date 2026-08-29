export type LearnerGoal = 'interview' | 'coursework' | 'career_change' | 'exploration';
export type LearnerExperience = 'new' | 'some' | 'experienced';
export type LearnerLanguage = 'typescript' | 'python';

export type LearnerProfile = {
  goal: LearnerGoal;
  targetDate?: string;
  experience: LearnerExperience;
  preferredLanguage: LearnerLanguage;
  weeklyMinutes: number;
  timezone: string;
  accessibilityNotes?: string;
  diagnosticOptIn: boolean;
  personalizationOptOut?: boolean;
};

export type LearnerPlan = {
  pace: 'light' | 'standard' | 'intensive';
  suggestedTopics: string[];
  explanation: string;
};

export const goalLabel: Record<LearnerGoal, string> = {
  interview: 'Interview preparation',
  coursework: 'Coursework',
  career_change: 'Career change',
  exploration: 'Exploration',
};

export const experienceLabel: Record<LearnerExperience, string> = {
  new: 'New to algorithms',
  some: 'Some experience',
  experienced: 'Experienced',
};

export function profileForEditor(profile: LearnerProfile): LearnerProfile {
  return {
    ...profile,
    targetDate: profile.targetDate ? profile.targetDate.slice(0, 10) : '',
    accessibilityNotes: profile.accessibilityNotes ?? '',
    personalizationOptOut: profile.personalizationOptOut ?? false,
  };
}

export function profilePayload(profile: LearnerProfile): LearnerProfile {
  const { targetDate, accessibilityNotes, ...requiredFields } = profile;
  return {
    ...requiredFields,
    ...(targetDate?.trim() ? { targetDate: targetDate.trim().slice(0, 10) } : {}),
    ...(accessibilityNotes?.trim() ? { accessibilityNotes: accessibilityNotes.trim() } : {}),
    personalizationOptOut: requiredFields.personalizationOptOut ?? false,
  };
}

export function isLearnerProfile(value: unknown): value is LearnerProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<LearnerProfile>;
  return typeof profile.goal === 'string'
    && typeof profile.experience === 'string'
    && typeof profile.preferredLanguage === 'string'
    && typeof profile.weeklyMinutes === 'number'
    && typeof profile.timezone === 'string'
    && typeof profile.diagnosticOptIn === 'boolean';
}

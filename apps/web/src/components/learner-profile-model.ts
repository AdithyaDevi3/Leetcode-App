export type LearnerGoal = 'interview' | 'coursework' | 'career_change' | 'exploration';
export type LearnerExperience = 'new' | 'some' | 'experienced';
export type LearnerLanguage = 'python' | 'cpp' | 'typescript';

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
  return ['interview', 'coursework', 'career_change', 'exploration'].includes(profile.goal ?? '')
    && ['new', 'some', 'experienced'].includes(profile.experience ?? '')
    && (profile.preferredLanguage === 'python' || profile.preferredLanguage === 'cpp' || profile.preferredLanguage === 'typescript')
    && Number.isInteger(profile.weeklyMinutes) && Number(profile.weeklyMinutes) >= 30 && Number(profile.weeklyMinutes) <= 1_680
    && typeof profile.timezone === 'string'
    && Boolean(profile.timezone.trim())
    && typeof profile.diagnosticOptIn === 'boolean'
    && (profile.personalizationOptOut === undefined || typeof profile.personalizationOptOut === 'boolean')
    && (profile.targetDate === undefined || (typeof profile.targetDate === 'string' && Number.isFinite(Date.parse(profile.targetDate))))
    && (profile.accessibilityNotes === undefined || (typeof profile.accessibilityNotes === 'string' && profile.accessibilityNotes.length <= 2_000));
}

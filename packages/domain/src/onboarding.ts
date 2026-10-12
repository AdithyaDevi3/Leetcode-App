export type LearnerGoal = 'interview' | 'coursework' | 'career_change' | 'exploration';
export type LearnerProfile = { goal: LearnerGoal; targetDate?: string; experience: 'new' | 'some' | 'experienced'; preferredLanguage: 'python' | 'cpp' | 'typescript'; weeklyMinutes: number; timezone: string; accessibilityNotes?: string; diagnosticOptIn: boolean; personalizationOptOut?: boolean };
export type InitialLearningPlan = { pace: 'light' | 'standard' | 'intensive'; suggestedTopics: string[]; explanation: string };

export function validateLearnerProfile(profile: LearnerProfile): string[] {
  const errors: string[] = [];
  if (!['interview', 'coursework', 'career_change', 'exploration'].includes(profile.goal)) errors.push('Unsupported goal');
  if (!['new', 'some', 'experienced'].includes(profile.experience)) errors.push('Unsupported experience');
  if (!['python', 'cpp', 'typescript'].includes(profile.preferredLanguage)) errors.push('Unsupported preferredLanguage');
  if (!Number.isInteger(profile.weeklyMinutes) || profile.weeklyMinutes < 30 || profile.weeklyMinutes > 1_680) errors.push('weeklyMinutes must be between 30 and 1680');
  if (typeof profile.timezone !== 'string' || !profile.timezone.trim() || profile.timezone.length > 100) errors.push('Timezone is required and must not exceed 100 characters');
  if (profile.targetDate !== undefined && (typeof profile.targetDate !== 'string' || Number.isNaN(Date.parse(profile.targetDate)))) errors.push('targetDate must be valid');
  if (profile.accessibilityNotes !== undefined && (typeof profile.accessibilityNotes !== 'string' || profile.accessibilityNotes.length > 2_000)) errors.push('accessibilityNotes must be a string of at most 2000 characters');
  if (typeof profile.diagnosticOptIn !== 'boolean') errors.push('diagnosticOptIn must be boolean');
  if (profile.personalizationOptOut !== undefined && typeof profile.personalizationOptOut !== 'boolean') errors.push('personalizationOptOut must be boolean');
  return errors;
}

export function buildInitialLearningPlan(profile: LearnerProfile): InitialLearningPlan {
  const pace = profile.weeklyMinutes < 120 ? 'light' : profile.weeklyMinutes < 360 ? 'standard' : 'intensive';
  const suggestedTopics = profile.experience === 'new' ? ['arrays', 'hashing', 'two-pointers'] : ['hashing', 'sliding-window', 'trees'];
  return { pace, suggestedTopics, explanation: `${pace} plan based on ${profile.weeklyMinutes} minutes per week and ${profile.experience} experience.` };
}

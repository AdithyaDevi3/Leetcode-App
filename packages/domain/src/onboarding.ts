export type LearnerGoal = 'interview' | 'coursework' | 'career_change' | 'exploration';
export type LearnerProfile = { goal: LearnerGoal; targetDate?: string; experience: 'new' | 'some' | 'experienced'; preferredLanguage: 'typescript' | 'python'; weeklyMinutes: number; timezone: string; accessibilityNotes?: string; diagnosticOptIn: boolean };
export type InitialLearningPlan = { pace: 'light' | 'standard' | 'intensive'; suggestedTopics: string[]; explanation: string };

export function validateLearnerProfile(profile: LearnerProfile): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(profile.weeklyMinutes) || profile.weeklyMinutes < 30 || profile.weeklyMinutes > 1_680) errors.push('weeklyMinutes must be between 30 and 1680');
  if (!profile.timezone.trim()) errors.push('Timezone is required');
  if (profile.targetDate && Number.isNaN(Date.parse(profile.targetDate))) errors.push('targetDate must be valid');
  return errors;
}

export function buildInitialLearningPlan(profile: LearnerProfile): InitialLearningPlan {
  const pace = profile.weeklyMinutes < 120 ? 'light' : profile.weeklyMinutes < 360 ? 'standard' : 'intensive';
  const suggestedTopics = profile.experience === 'new' ? ['arrays', 'hashing', 'two-pointers'] : ['hashing', 'sliding-window', 'trees'];
  return { pace, suggestedTopics, explanation: `${pace} plan based on ${profile.weeklyMinutes} minutes per week and ${profile.experience} experience.` };
}

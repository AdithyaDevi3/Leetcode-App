export type LocalLearnerProfile = {
  goal: 'interview' | 'coursework' | 'career_change' | 'exploration';
  experience: 'new' | 'some' | 'experienced';
  preferredLanguage: 'typescript' | 'python';
  weeklyMinutes: number;
  timezone: string;
  diagnosticOptIn: boolean;
};

export type LocalLearningPlan = {
  pace: 'light' | 'standard' | 'intensive';
  suggestedTopics: string[];
  explanation: string;
};

export const localLearnerProfileKey = 'leetcode-app.local-learner-profile.v1';

export const defaultLocalLearnerProfile: LocalLearnerProfile = {
  goal: 'interview',
  experience: 'new',
  preferredLanguage: 'typescript',
  weeklyMinutes: 120,
  timezone: 'UTC',
  diagnosticOptIn: false,
};

export function buildLocalLearningPlan(profile: LocalLearnerProfile): LocalLearningPlan {
  const pace = profile.weeklyMinutes < 90 ? 'light' : profile.weeklyMinutes > 300 ? 'intensive' : 'standard';
  const topics = profile.experience === 'new'
    ? ['arrays', 'hashing', 'two-pointers']
    : profile.experience === 'some'
      ? ['hashing', 'sliding-window', 'trees']
      : ['graphs', 'dynamic-programming', 'system-design'];
  const goal = profile.goal === 'interview' ? 'interview practice' : profile.goal.replace('_', ' ');
  return { pace, suggestedTopics: topics, explanation: `Your ${pace} plan focuses on ${goal} with ${profile.weeklyMinutes} minutes each week.` };
}

export function readLocalLearnerProfile(): LocalLearnerProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(localLearnerProfileKey) ?? 'null') as Partial<LocalLearnerProfile> | null;
    if (!value || typeof value.weeklyMinutes !== 'number' || !value.goal || !value.experience || !value.preferredLanguage || !value.timezone) return null;
    return { ...defaultLocalLearnerProfile, ...value };
  } catch { return null; }
}

export function writeLocalLearnerProfile(profile: LocalLearnerProfile): void {
  window.localStorage.setItem(localLearnerProfileKey, JSON.stringify(profile));
}

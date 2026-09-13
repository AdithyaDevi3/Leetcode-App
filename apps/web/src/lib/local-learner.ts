import { practiceItems, type PracticeDifficulty, type PracticeItem, type PracticeTopic } from './content';
import type { LocalPracticeHistoryEntry } from './local-practice-history';
import { readBrowserStorage, writeBrowserStorage } from './safe-browser-storage';

export type LocalLearnerProfile = {
  goal: 'interview' | 'coursework' | 'career_change' | 'exploration';
  experience: 'new' | 'some' | 'experienced';
  preferredLanguage: 'typescript' | 'python';
  weeklyMinutes: number;
  timezone: string;
  diagnosticOptIn: boolean;
  personalizationOptOut: boolean;
};

export type LocalPracticeRecommendation = {
  practiceItemId: string;
  label: string;
  topic: PracticeTopic;
  difficulty: PracticeDifficulty;
  estimatedMinutes: number;
  score: number;
  reasons: string[];
};

export type LocalLearningPlan = {
  pace: 'light' | 'standard' | 'intensive';
  suggestedTopics: PracticeTopic[];
  recommendations: LocalPracticeRecommendation[];
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
  personalizationOptOut: false,
};

const goalTopics: Record<LocalLearnerProfile['goal'], PracticeTopic[]> = {
  interview: ['hashing', 'two-pointers', 'sliding-window', 'stacks', 'trees', 'graphs', 'dynamic-programming', 'queues'],
  coursework: ['stacks', 'trees', 'graphs', 'queues', 'dynamic-programming', 'hashing', 'sliding-window', 'two-pointers'],
  career_change: ['hashing', 'stacks', 'two-pointers', 'sliding-window', 'trees', 'graphs', 'dynamic-programming', 'queues'],
  exploration: ['graphs', 'dynamic-programming', 'trees', 'sliding-window', 'hashing', 'queues', 'stacks', 'two-pointers'],
};

const difficultyFit: Record<LocalLearnerProfile['experience'], Record<PracticeDifficulty, number>> = {
  new: { foundation: 32, intermediate: 8, advanced: -18 },
  some: { foundation: 14, intermediate: 32, advanced: 10 },
  experienced: { foundation: 2, intermediate: 24, advanced: 36 },
};

const isOneOf = <Value extends string>(value: unknown, options: readonly Value[]): value is Value =>
  typeof value === 'string' && options.includes(value as Value);

const paceFor = (weeklyMinutes: number): LocalLearningPlan['pace'] =>
  weeklyMinutes < 90 ? 'light' : weeklyMinutes > 300 ? 'intensive' : 'standard';

const sessionMinutesFor = (pace: LocalLearningPlan['pace']) =>
  pace === 'light' ? 20 : pace === 'intensive' ? 45 : 30;

const ageInDays = (completedAt: string, asOf: Date) => {
  const completedTime = new Date(completedAt).getTime();
  if (!Number.isFinite(completedTime)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((asOf.getTime() - completedTime) / 86_400_000));
};

export function recommendLocalPractice(
  profile: LocalLearnerProfile,
  history: LocalPracticeHistoryEntry[] = [],
  items: PracticeItem[] = practiceItems,
  asOf = new Date(),
): LocalPracticeRecommendation[] {
  const historyByPracticeId = new Map(history.map((entry) => [entry.practiceItemId, entry]));
  const pace = paceFor(profile.weeklyMinutes);
  const sessionMinutes = sessionMinutesFor(pace);
  const topicOrder = goalTopics[profile.goal];

  return items
    .map((item, curriculumIndex) => {
      const completion = historyByPracticeId.get(item.id);
      const reasons: string[] = [];
      let score = (items.length - curriculumIndex) * 2;

      if (!completion) {
        score += 38;
        reasons.push('Not completed on this device');
      } else {
        const daysOld = ageInDays(completion.completedAt, asOf);
        if (completion.evaluationScore !== null && completion.evaluationScore < 80) {
          score += 34 + Math.min(20, 80 - completion.evaluationScore);
          reasons.push('Reinforces a lower-scoring skill');
        } else {
          score -= 24;
        }
        if (daysOld >= 7) {
          score += 26;
          reasons.push('Ready for review');
        } else if (daysOld <= 1) {
          score -= 28;
        }
      }

      if (profile.personalizationOptOut) {
        reasons.push('Next in the standard curriculum');
      } else {
        const topicIndex = topicOrder.indexOf(item.topic);
        if (topicIndex >= 0) {
          score += Math.max(8, 48 - topicIndex * 6);
          if (topicIndex < 3) reasons.push(`Matches your ${profile.goal.replace('_', ' ')} focus`);
        }

        const experienceScore = difficultyFit[profile.experience][item.difficulty];
        score += experienceScore;
        if (experienceScore >= 24) reasons.push(`Fits your ${profile.experience} experience level`);

        if (item.estimatedMinutes <= sessionMinutes) {
          score += 12;
          reasons.push(`Fits a ${sessionMinutes}-minute session`);
        } else {
          score -= Math.min(20, item.estimatedMinutes - sessionMinutes);
        }

        if (profile.diagnosticOptIn && item.difficulty !== 'foundation') {
          score += 8;
          reasons.push('Adds diagnostic challenge');
        }
      }

      return {
        practiceItemId: item.id,
        label: item.label,
        topic: item.topic,
        difficulty: item.difficulty,
        estimatedMinutes: item.estimatedMinutes,
        score,
        reasons: reasons.slice(0, 3),
        curriculumIndex,
      };
    })
    .sort((left, right) => right.score - left.score || left.curriculumIndex - right.curriculumIndex)
    .map((recommendation) => ({
      practiceItemId: recommendation.practiceItemId,
      label: recommendation.label,
      topic: recommendation.topic,
      difficulty: recommendation.difficulty,
      estimatedMinutes: recommendation.estimatedMinutes,
      score: recommendation.score,
      reasons: recommendation.reasons,
    }));
}

export function buildLocalLearningPlan(
  profile: LocalLearnerProfile,
  history: LocalPracticeHistoryEntry[] = [],
  asOf = new Date(),
): LocalLearningPlan {
  const pace = paceFor(profile.weeklyMinutes);
  const recommendations = recommendLocalPractice(profile, history, practiceItems, asOf).slice(0, 3);
  const suggestedTopics = [...new Set(recommendations.map((recommendation) => recommendation.topic))];
  const goal = profile.goal === 'interview' ? 'interview practice' : profile.goal.replace('_', ' ');
  const explanation = profile.personalizationOptOut
    ? `Your ${pace} plan follows the standard curriculum with ${profile.weeklyMinutes} minutes each week.`
    : `Your ${pace} plan uses your ${goal} goal, ${profile.experience} experience, time budget, and local practice history.`;

  return { pace, suggestedTopics, recommendations, explanation };
}

export function readLocalLearnerProfile(): LocalLearnerProfile | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = JSON.parse(readBrowserStorage(localLearnerProfileKey) ?? 'null') as Partial<LocalLearnerProfile> | null;
    if (
      !value ||
      !isOneOf(value.goal, ['interview', 'coursework', 'career_change', 'exploration']) ||
      !isOneOf(value.experience, ['new', 'some', 'experienced']) ||
      !isOneOf(value.preferredLanguage, ['typescript', 'python']) ||
      typeof value.weeklyMinutes !== 'number' ||
      !Number.isInteger(value.weeklyMinutes) ||
      value.weeklyMinutes < 30 ||
      value.weeklyMinutes > 1_680 ||
      typeof value.timezone !== 'string' ||
      !value.timezone.trim()
    ) return null;

    return { ...defaultLocalLearnerProfile, ...value };
  } catch {
    return null;
  }
}

export function writeLocalLearnerProfile(profile: LocalLearnerProfile): boolean {
  return writeBrowserStorage(localLearnerProfileKey, JSON.stringify(profile));
}

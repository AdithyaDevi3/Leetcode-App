import { practiceItems, type PracticeDifficulty, type PracticeItem, type PracticeTopic } from './content';
import type { LocalPracticeHistoryEntry } from './local-practice-history';
import { itemMastery, type LocalMasteryState } from './local-mastery';
import { readBrowserStorage, writeBrowserStorage } from './safe-browser-storage';

export type LocalLearnerProfile = {
  goal: 'interview' | 'coursework' | 'career_change' | 'exploration';
  experience: 'new' | 'some' | 'experienced';
  preferredLanguage: 'python' | 'cpp' | 'typescript';
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

export const personalizationPolicy = {
  version: 'local-personalization-v2',
  pace: { lightBelowMinutes: 90, intensiveAboveMinutes: 300, sessionMinutes: { light: 20, standard: 30, intensive: 45 } },
  scoring: {
    curriculumStep: 2,
    incomplete: 38,
    lowScoreThreshold: 80,
    lowScoreBase: 34,
    lowScoreGapCap: 20,
    completed: -24,
    reviewAfterDays: 7,
    reviewDue: 26,
    recentWithinDays: 1,
    recentlySeen: -28,
    goalStart: 48,
    goalStep: 6,
    goalFloor: 8,
    sessionFit: 12,
    sessionOverrunCap: 20,
    diagnosticChallenge: 8,
    masteryGapMax: 36,
  },
  difficultyFit: {
    new: { foundation: 32, intermediate: 8, advanced: -18 },
    some: { foundation: 14, intermediate: 32, advanced: 10 },
    experienced: { foundation: 2, intermediate: 24, advanced: 36 },
  },
} as const;

export const defaultLocalLearnerProfile: LocalLearnerProfile = {
  goal: 'interview',
  experience: 'new',
  preferredLanguage: 'python',
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

const isOneOf = <Value extends string>(value: unknown, options: readonly Value[]): value is Value =>
  typeof value === 'string' && options.includes(value as Value);

const paceFor = (weeklyMinutes: number): LocalLearningPlan['pace'] =>
  weeklyMinutes < personalizationPolicy.pace.lightBelowMinutes
    ? 'light'
    : weeklyMinutes > personalizationPolicy.pace.intensiveAboveMinutes
      ? 'intensive'
      : 'standard';

const sessionMinutesFor = (pace: LocalLearningPlan['pace']) =>
  personalizationPolicy.pace.sessionMinutes[pace];

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
  mastery: LocalMasteryState = {},
): LocalPracticeRecommendation[] {
  const historyByPracticeId = new Map(history.map((entry) => [entry.practiceItemId, entry]));
  const pace = paceFor(profile.weeklyMinutes);
  const sessionMinutes = sessionMinutesFor(pace);
  const topicOrder = goalTopics[profile.goal];

  return items
    .map((item, curriculumIndex) => {
      const completion = historyByPracticeId.get(item.id);
      const reasons: string[] = [];
      let score = (items.length - curriculumIndex) * personalizationPolicy.scoring.curriculumStep;

      if (!completion) {
        score += personalizationPolicy.scoring.incomplete;
        reasons.push('Not completed on this device');
      } else {
        const daysOld = ageInDays(completion.completedAt, asOf);
        if (completion.evaluationScore !== null && completion.evaluationScore < personalizationPolicy.scoring.lowScoreThreshold) {
          score += personalizationPolicy.scoring.lowScoreBase + Math.min(
            personalizationPolicy.scoring.lowScoreGapCap,
            personalizationPolicy.scoring.lowScoreThreshold - completion.evaluationScore,
          );
          reasons.push('Reinforces a lower-scoring skill');
        } else {
          score += personalizationPolicy.scoring.completed;
        }
        if (daysOld >= personalizationPolicy.scoring.reviewAfterDays) {
          score += personalizationPolicy.scoring.reviewDue;
          reasons.push('Ready for review');
        } else if (daysOld <= personalizationPolicy.scoring.recentWithinDays) {
          score += personalizationPolicy.scoring.recentlySeen;
        }
      }

      if (profile.personalizationOptOut) {
        reasons.push('Next in the standard curriculum');
      } else {
        const topicIndex = topicOrder.indexOf(item.topic);
        if (topicIndex >= 0) {
          score += Math.max(
            personalizationPolicy.scoring.goalFloor,
            personalizationPolicy.scoring.goalStart - topicIndex * personalizationPolicy.scoring.goalStep,
          );
          if (topicIndex < 3) reasons.push(`Matches your ${profile.goal.replace('_', ' ')} focus`);
        }

        const experienceScore = personalizationPolicy.difficultyFit[profile.experience][item.difficulty];
        score += experienceScore;
        if (experienceScore >= 24) reasons.push(`Fits your ${profile.experience} experience level`);

        if (item.estimatedMinutes <= sessionMinutes) {
          score += personalizationPolicy.scoring.sessionFit;
          reasons.push(`Fits a ${sessionMinutes}-minute session`);
        } else {
          score -= Math.min(personalizationPolicy.scoring.sessionOverrunCap, item.estimatedMinutes - sessionMinutes);
        }

        if (profile.diagnosticOptIn && item.difficulty !== 'foundation') {
          score += personalizationPolicy.scoring.diagnosticChallenge;
          reasons.push('Adds diagnostic challenge');
        }

        const currentMastery = itemMastery(item, mastery);
        if (currentMastery !== null) {
          score += Math.round((1 - currentMastery) * personalizationPolicy.scoring.masteryGapMax);
          if (currentMastery < 0.7) reasons.push('Targets concepts that still need evidence');
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
  mastery: LocalMasteryState = {},
): LocalLearningPlan {
  const pace = paceFor(profile.weeklyMinutes);
  const recommendations = recommendLocalPractice(profile, history, practiceItems, asOf, mastery).slice(0, 3);
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
      !isOneOf(value.preferredLanguage, ['python', 'cpp', 'typescript']) ||
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

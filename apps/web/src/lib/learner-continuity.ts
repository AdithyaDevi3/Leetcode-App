import { findPracticeItem } from './content';
import {
  readLocalLearnerProfile,
  writeLocalLearnerProfile,
  type LocalLearnerProfile,
} from './local-learner';
import {
  readLocalPracticeHistory,
  upsertLocalPracticeHistory,
  type LocalPracticeHistoryEntry,
} from './local-practice-history';

export type LearnerProfileSource = 'account' | 'device' | 'none';
export type LearnerReview = {
  id: string;
  conceptId: string;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  practiceItemId: string | null;
  label: string;
};

const isOneOf = <Value extends string>(value: unknown, options: readonly Value[]): value is Value =>
  typeof value === 'string' && options.includes(value as Value);

export const parseLearnerProfile = (value: unknown): LocalLearnerProfile | null => {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Partial<LocalLearnerProfile>;
  if (
    !isOneOf(profile.goal, ['interview', 'coursework', 'career_change', 'exploration']) ||
    !isOneOf(profile.experience, ['new', 'some', 'experienced']) ||
    !isOneOf(profile.preferredLanguage, ['python', 'cpp', 'typescript']) ||
    !Number.isInteger(profile.weeklyMinutes) ||
    (profile.weeklyMinutes ?? 0) < 30 ||
    (profile.weeklyMinutes ?? 0) > 1_680 ||
    typeof profile.timezone !== 'string' ||
    !profile.timezone.trim() ||
    typeof profile.diagnosticOptIn !== 'boolean'
  ) return null;

  return {
    goal: profile.goal,
    experience: profile.experience,
    preferredLanguage: profile.preferredLanguage,
    weeklyMinutes: profile.weeklyMinutes!,
    timezone: profile.timezone,
    diagnosticOptIn: profile.diagnosticOptIn,
    personalizationOptOut: profile.personalizationOptOut === true,
  };
};

export type LoadedLearnerProfile = { profile: LocalLearnerProfile | null; source: LearnerProfileSource; learnerId: string | null };

export async function loadLearnerProfile(): Promise<LoadedLearnerProfile> {
  const local = readLocalLearnerProfile();
  try {
    const response = await fetch('/api/learner/profile', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (response.ok) {
      const body = await response.json() as { profile?: unknown; learnerId?: unknown };
      if (typeof body.learnerId !== 'string' || !body.learnerId || body.learnerId.length > 128) throw new Error('Account identity was not confirmed');
      if (body.profile === null) return { profile: null, source: 'account', learnerId: body.learnerId };
      const accountProfile = parseLearnerProfile(body.profile);
      if (accountProfile) {
        return { profile: accountProfile, source: 'account', learnerId: body.learnerId };
      }
    }
  } catch {
    // Device continuity remains available while the account API is unavailable.
  }
  return { profile: local, source: local ? 'device' : 'none', learnerId: null };
}

export async function saveLearnerProfile(profile: LocalLearnerProfile, expectedOwner?: string | null): Promise<LearnerProfileSource> {
  if (!expectedOwner) return writeLocalLearnerProfile(profile) ? 'device' : 'none';
  const response = await fetch('/api/learner/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-learning-owner': expectedOwner },
      body: JSON.stringify(profile),
      signal: AbortSignal.timeout(15_000),
    });
  const body = await response.json().catch(() => null) as { learnerId?: unknown; profile?: unknown; error?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'Your account plan could not be saved. Please retry.');
  if (body?.learnerId !== expectedOwner || !parseLearnerProfile(body.profile)) throw new Error('Your signed-in account changed. Reload before saving your plan.');
  return 'account';
}

type RemoteHistoryItem = {
  session?: {
    contentId?: unknown;
    status?: unknown;
    updatedAt?: unknown;
  };
  evaluation?: { score?: unknown } | null;
};

export async function loadLearnerPracticeHistory(): Promise<LocalPracticeHistoryEntry[]> {
  const local = readLocalPracticeHistory();
  try {
    const response = await fetch('/api/practice/history');
    if (!response.ok) return local;
    const body = await response.json() as { sessions?: unknown };
    if (!Array.isArray(body.sessions)) return local;

    return (body.sessions as RemoteHistoryItem[]).reduce((history, item) => {
      const contentId = item.session?.contentId;
      const completedAt = item.session?.updatedAt;
      if (item.session?.status !== 'completed' || typeof contentId !== 'string' || typeof completedAt !== 'string') return history;
      const content = findPracticeItem(contentId);
      return upsertLocalPracticeHistory(history, {
        practiceItemId: contentId,
        label: content?.label ?? contentId,
        completedAt,
        evaluationScore: typeof item.evaluation?.score === 'number' ? item.evaluation.score : null,
      });
    }, local);
  } catch {
    return local;
  }
}

export async function loadLearnerReviews(): Promise<LearnerReview[]> {
  try {
    const response = await fetch('/api/learner/reviews');
    if (!response.ok) return [];
    const body = await response.json() as { reviews?: unknown };
    if (!Array.isArray(body.reviews)) return [];
    return body.reviews.filter((review): review is LearnerReview => {
      if (!review || typeof review !== 'object') return false;
      const candidate = review as Partial<LearnerReview>;
      return typeof candidate.id === 'string'
        && typeof candidate.conceptId === 'string'
        && typeof candidate.dueAt === 'string'
        && typeof candidate.intervalDays === 'number'
        && typeof candidate.repetitions === 'number'
        && (typeof candidate.practiceItemId === 'string' || candidate.practiceItemId === null)
        && typeof candidate.label === 'string';
    });
  } catch {
    return [];
  }
}

export async function snoozeLearnerReview(reviewId: string, snoozeDays: 1 | 3 | 7, expectedOwner?: string): Promise<boolean> {
  if (!expectedOwner) return false;
  try {
    const response = await fetch('/api/learner/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-learning-owner': expectedOwner },
      body: JSON.stringify({ reviewId, snoozeDays }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadLearnerPracticeHistory,
  loadLearnerProfile,
  loadLearnerReviews,
  parseLearnerProfile,
  saveLearnerProfile,
} from './learner-continuity';

const profile = {
  goal: 'interview' as const,
  experience: 'some' as const,
  preferredLanguage: 'python' as const,
  weeklyMinutes: 180,
  timezone: 'America/New_York',
  diagnosticOptIn: true,
  personalizationOptOut: false,
};

describe('learner continuity', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.unstubAllGlobals();
    storage.clear();
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    };
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('localStorage', localStorage);
  });

  it('validates learner profiles before hydrating account data', () => {
    expect(parseLearnerProfile(profile)).toEqual(profile);
    expect(parseLearnerProfile({ ...profile, weeklyMinutes: 0 })).toBeNull();
    expect(parseLearnerProfile({ ...profile, preferredLanguage: 'ruby' })).toBeNull();
  });

  it('loads an account profile and caches it for offline continuity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ profile }), { status: 200 })));

    await expect(loadLearnerProfile()).resolves.toEqual({ profile, source: 'account' });
    expect(storage.get('leetcode-app.local-learner-profile.v1')).toContain('America/New_York');
  });

  it('keeps onboarding durable on the device when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })));

    await expect(saveLearnerProfile(profile)).resolves.toBe('device');
    await expect(loadLearnerProfile()).resolves.toEqual({ profile, source: 'device' });
  });

  it('merges completed account sessions into recommendation history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessions: [
      {
        session: { contentId: 'pair-with-target-v1', status: 'completed', updatedAt: '2026-10-12T12:00:00.000Z' },
        evaluation: { score: 88 },
      },
      {
        session: { contentId: 'tree-max-depth-v1', status: 'in_progress', updatedAt: '2026-10-12T13:00:00.000Z' },
        evaluation: null,
      },
    ] }), { status: 200 })));

    await expect(loadLearnerPracticeHistory()).resolves.toEqual([
      {
        practiceItemId: 'pair-with-target-v1',
        label: 'Pair With Target',
        completedAt: '2026-10-12T12:00:00.000Z',
        evaluationScore: 88,
      },
    ]);
  });

  it('loads only valid durable review records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ reviews: [
      { id: 'review-1', conceptId: 'hash-maps', dueAt: '2026-10-12T12:00:00.000Z', intervalDays: 2, repetitions: 1, practiceItemId: 'pair-with-target-v1', label: 'Pair With Target' },
      { id: 'invalid' },
    ] }), { status: 200 })));
    await expect(loadLearnerReviews()).resolves.toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadLearnerPracticeHistory,
  loadLearnerProfile,
  loadLearnerReviews,
  parseLearnerProfile,
  saveLearnerProfile,
  snoozeLearnerReview,
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

  it('loads an account profile with its original owner without overwriting shared device preferences', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ learnerId: 'owner-1', profile }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(loadLearnerProfile()).resolves.toEqual({ profile, source: 'account', learnerId: 'owner-1' });
    expect(fetcher).toHaveBeenCalledWith('/api/learner/profile', expect.objectContaining({ cache: 'no-store' }));
    expect(storage.has('leetcode-app.local-learner-profile.v1')).toBe(false);
  });

  it('keeps onboarding durable on the device when signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })));

    await expect(saveLearnerProfile(profile)).resolves.toBe('device');
    await expect(loadLearnerProfile()).resolves.toEqual({ profile, source: 'device', learnerId: null });
  });

  it('retains account identity before first onboarding without attaching a device profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ learnerId: 'new-owner', profile: null }))));
    await expect(loadLearnerProfile()).resolves.toEqual({ profile: null, source: 'account', learnerId: 'new-owner' });
  });

  it('saves without an owner only on the device and never discovers a new account at save time', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(saveLearnerProfile(profile)).resolves.toBe('device');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(snoozeLearnerReview('review-1', 1)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends the owner captured at load and verifies the acknowledged owner on success', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ learnerId: 'original-owner', profile })));
    vi.stubGlobal('fetch', fetcher);
    await expect(saveLearnerProfile(profile, 'original-owner')).resolves.toBe('account');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith('/api/learner/profile', expect.objectContaining({ method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-learning-owner': 'original-owner' } }));
    expect(storage.size).toBe(0);
  });

  it.each([
    [409, { code: 'owner_changed', error: 'Your signed-in account changed.' }],
    [503, { error: 'Temporarily unavailable.' }],
    [200, { learnerId: 'switched-owner', profile }],
    [200, { profile }],
  ])('does not silently claim device/account consent success for an unconfirmed save', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    await expect(saveLearnerProfile(profile, 'original-owner')).rejects.toThrow();
    expect(storage.size).toBe(0);
  });

  it('does not treat a profile without a confirmed owner as account data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ profile }))));
    await expect(loadLearnerProfile()).resolves.toEqual({ profile: null, source: 'none', learnerId: null });
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

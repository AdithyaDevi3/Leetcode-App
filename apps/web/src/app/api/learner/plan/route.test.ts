import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn();
const getProfile = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/personalization-store', () => ({ createPersonalizationStore: () => ({ getProfile }) }));

describe('/api/learner/plan', () => {
  beforeEach(() => vi.resetAllMocks());
  it('requires onboarding before returning a plan', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    getProfile.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET()).status).toBe(404);
  });
  it('builds a plan from the signed-in learner profile', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    getProfile.mockResolvedValue({ goal: 'interview', experience: 'new', preferredLanguage: 'typescript', weeklyMinutes: 120, timezone: 'UTC', diagnosticOptIn: false, personalizationOptOut: false });
    const { GET } = await import('./route');
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).plan.suggestedTopics).toContain('Hash maps');
  });
});

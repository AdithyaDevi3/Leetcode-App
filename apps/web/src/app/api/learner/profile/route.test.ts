import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const getProfile = vi.fn(); const upsertProfile = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/personalization-store', () => ({ createPersonalizationStore: () => ({ getProfile, upsertProfile }) }));

const profile = { goal: 'interview', experience: 'new', preferredLanguage: 'typescript', weeklyMinutes: 90, timezone: 'America/New_York', diagnosticOptIn: true };
describe('/api/learner/profile', () => {
  beforeEach(() => vi.resetAllMocks());
  it('returns an owned profile', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); getProfile.mockResolvedValue(profile);
    const { GET } = await import('./route');
    expect((await GET()).status).toBe(200); expect(getProfile).toHaveBeenCalledWith('user-1');
  });
  it('validates and saves an onboarding profile', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); upsertProfile.mockResolvedValue(profile);
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify(profile) }));
    expect(response.status).toBe(200); expect(upsertProfile).toHaveBeenCalledWith('user-1', profile);
  });
});

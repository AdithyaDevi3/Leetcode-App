import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), get: vi.fn(), upsert: vi.fn(), close: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.auth }));
vi.mock('@/lib/personalization-store', () => ({ createPersonalizationStore: mocks.create }));
import { GET, PUT } from './route';

const owner = 'owner-original';
const profile = { goal: 'interview', experience: 'new', preferredLanguage: 'typescript', weeklyMinutes: 90, timezone: 'America/New_York', diagnosticOptIn: true, personalizationOptOut: true };
const request = (body = JSON.stringify(profile), expectedOwner: string | null = owner) => new Request('http://localhost/api/learner/profile', {
  method: 'PUT', body, headers: expectedOwner === null ? {} : { 'x-learning-owner': expectedOwner },
});
const expectPrivate = (response: Response) => {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('vary')).toBe('Cookie, x-learning-owner');
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: owner } });
  mocks.create.mockReturnValue({ getProfile: mocks.get, upsertProfile: mocks.upsert, close: mocks.close });
  mocks.get.mockResolvedValue(profile); mocks.upsert.mockResolvedValue(profile); mocks.close.mockResolvedValue(undefined);
});

describe('owner-bound learner profile and consent', () => {
  it('returns the verified owner even before their first profile exists', async () => {
    mocks.get.mockResolvedValue(null);
    const response = await GET(new Request('http://localhost'));
    expect(response.status).toBe(200); expectPrivate(response);
    expect(await response.json()).toEqual({ learnerId: owner, profile: null });
    expect(mocks.auth).toHaveBeenCalledWith({ failOnAuthError: true });
    expect(mocks.get).toHaveBeenCalledWith(owner); expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('rejects a switched optional read owner before creating a pool', async () => {
    const response = await GET(new Request('http://localhost', { headers: { 'x-learning-owner': 'other-owner' } }));
    expect(response.status).toBe(409); expectPrivate(response); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('saves the original owner’s explicit preference and echoes identity', async () => {
    const response = await PUT(request());
    expect(response.status).toBe(200); expectPrivate(response);
    expect(await response.json()).toMatchObject({ learnerId: owner, profile });
    expect(mocks.upsert).toHaveBeenCalledWith(owner, profile); expect(mocks.close).toHaveBeenCalledOnce();
  });
  it.each([null, 'other-owner'])('denies absent/switched write ownership before body or pool access', async expectedOwner => {
    const pending = request('{', expectedOwner); const reader = vi.spyOn(pending.body!, 'getReader');
    const response = await PUT(pending);
    expect(response.status).toBe(409); expectPrivate(response);
    expect(await response.json()).toMatchObject({ code: 'owner_changed' });
    expect(reader).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('authenticates before malformed bodies and fails closed on verification outages', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await PUT(request('{', null))).status).toBe(401);
    mocks.auth.mockRejectedValue(new Error('SECRET token verification outage'));
    const response = await PUT(request('{', null));
    expect(response.status).toBe(503); expectPrivate(response);
    expect(await response.text()).not.toContain('SECRET'); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([{ ...profile, goal: 'admin' }, { ...profile, personalizationOptOut: 'false' },
    { ...profile, learnerId: 'other-owner' }, { ...profile, score: 100 }, null, []])('rejects invalid or client-authoritative fields', async body => {
    const response = await PUT(request(JSON.stringify(body)));
    expect(response.status).toBe(400); expectPrivate(response); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects ambiguous consent keys and oversized input before opening a pool', async () => {
    const duplicate = JSON.stringify(profile).replace('"personalizationOptOut":true', '"personalizationOptOut":true,"personalizationOptOut":false');
    expect((await PUT(request(duplicate))).status).toBe(400);
    const response = await PUT(request(JSON.stringify({ ...profile, padding: 'x'.repeat(16_001) })));
    expect(response.status).toBe(413); expectPrivate(response); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('closes pools on read/write failure without private database messages', async () => {
    mocks.get.mockRejectedValue(new Error('SECRET SQL')); mocks.upsert.mockRejectedValue(new Error('SECRET SQL'));
    for (const response of [await GET(new Request('http://localhost')), await PUT(request())]) {
      expect(response.status).toBe(503); expectPrivate(response); expect(await response.text()).not.toContain('SECRET');
    }
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });
});

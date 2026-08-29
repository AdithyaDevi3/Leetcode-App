import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const listOwned = vi.fn();
const upsertOwned = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/notification-preferences-store', () => ({ createNotificationPreferencesStore: () => ({ listOwned, upsertOwned }) }));

describe('/api/notifications/preferences', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns only the authenticated user preferences', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    listOwned.mockResolvedValue([{ channel: 'email', enabled: true }]);
    const { GET } = await import('./route');
    expect((await GET()).status).toBe(200);
    expect(listOwned).toHaveBeenCalledWith('user-1');
  });

  it('writes a valid preference under the authenticated owner', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    upsertOwned.mockResolvedValue({ channel: 'push', enabled: true, quietHoursStart: 22, quietHoursEnd: 8 });
    const { PUT } = await import('./route');
    const response = await PUT(new Request('http://localhost/api/notifications/preferences', { method: 'PUT', body: JSON.stringify({ preference: { channel: 'push', enabled: true, quietHoursStart: 22, quietHoursEnd: 8 } }) }));
    expect(response.status).toBe(200);
    expect(upsertOwned).toHaveBeenCalledWith('user-1', { channel: 'push', enabled: true, quietHoursStart: 22, quietHoursEnd: 8 });
  });

  it.each([
    { channel: 'sms', enabled: true },
    { channel: 'email', enabled: true, quietHoursStart: 24, quietHoursEnd: 8 },
    { channel: 'email', enabled: true, quietHoursStart: 22 },
  ])('rejects invalid preference %#', async (preference) => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    const { PUT } = await import('./route');
    expect((await PUT(new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ preference }) }))).status).toBe(400);
  });
});

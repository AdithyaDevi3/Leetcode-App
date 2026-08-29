import { describe, expect, it, vi } from 'vitest';
import { createNotificationPreferencesStore } from './notification-preferences-store';

describe('notification preferences store', () => {
  it('scopes reads to the requested owner', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ channel: 'email', enabled: true, quiet_hours_start: 22, quiet_hours_end: 8 }] });
    const store = createNotificationPreferencesStore({ query } as never);
    await expect(store.listOwned('user-1')).resolves.toEqual([{ channel: 'email', enabled: true, quietHoursStart: 22, quietHoursEnd: 8 }]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), ['user-1']);
  });

  it('uses a per-user channel upsert', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ channel: 'push', enabled: false, quiet_hours_start: null, quiet_hours_end: null }] });
    const store = createNotificationPreferencesStore({ query } as never);
    await store.upsertOwned('user-1', { channel: 'push', enabled: false });
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (user_id, channel) DO UPDATE');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 'push', false, null, null]);
  });
});

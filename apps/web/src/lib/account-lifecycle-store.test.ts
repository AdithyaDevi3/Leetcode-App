import { describe, expect, it, vi } from 'vitest';
import { createAccountLifecycleStore } from './account-lifecycle-store';

describe('account lifecycle store', () => {
  it('uses a database-enforced active-request idempotency key', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'request-1', user_id: 'user-1', type: 'export', status: 'requested', requested_at: '2026-01-01T00:00:00.000Z', completed_at: null, reason: null }] });
    const store = createAccountLifecycleStore({ query } as never);
    await expect(store.request('user-1', 'export', null)).resolves.toMatchObject({ id: 'request-1', userId: 'user-1' });
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (user_id, type) WHERE status IN ('requested', 'processing')");
  });
});

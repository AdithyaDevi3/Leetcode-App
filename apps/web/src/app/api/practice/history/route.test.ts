import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const listPracticeHistory = vi.fn();

vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/practice-api', () => ({ listPracticeHistory }));

describe('/api/practice/history', () => {
  beforeEach(() => {
    requireAuth.mockReset();
    listPracticeHistory.mockReset();
  });

  it('returns only the current learner history', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'learner-1' } });
    listPracticeHistory.mockResolvedValue([{ session: { id: 'session-1' } }]);
    const { GET } = await import('./route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listPracticeHistory).toHaveBeenCalledWith('learner-1');
    expect(await response.json()).toEqual({ sessions: [{ session: { id: 'session-1' } }] });
  });

  it('does not expose history without authentication', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized: Authentication required'));
    const { GET } = await import('./route');

    const response = await GET();

    expect(response.status).toBe(401);
    expect(listPracticeHistory).not.toHaveBeenCalled();
  });
});

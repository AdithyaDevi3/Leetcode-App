import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const list = vi.fn();
const snooze = vi.fn();
const close = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/review-store', () => ({ createReviewStore: () => ({ list, snooze, close }) }));

describe('/api/learner/reviews', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } });
    close.mockResolvedValue(undefined);
  });

  it('returns owned reviews with a linked practice activity', async () => {
    list.mockResolvedValue([{ id: 'review-1', conceptId: 'hash-maps', intervalDays: 2, repetitions: 1, dueAt: '2026-10-12T12:00:00.000Z' }]);
    const { GET } = await import('./route');
    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({ reviews: [{ practiceItemId: 'pair-with-target-v1', label: 'Pair With Target' }] });
    expect(list).toHaveBeenCalledWith('user-1');
    expect(close).toHaveBeenCalled();
  });

  it('validates and owner-scopes snooze requests', async () => {
    snooze.mockResolvedValue({ id: 'review-1', dueAt: '2026-10-13T12:00:00.000Z' });
    const { POST } = await import('./route');
    const invalid = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ reviewId: 'review-1', snoozeDays: 30 }) }));
    expect(invalid.status).toBe(400);
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ reviewId: 'review-1', snoozeDays: 1 }) }));
    expect(response.status).toBe(200);
    expect(snooze).toHaveBeenCalledWith('user-1', 'review-1', 1);
  });
});

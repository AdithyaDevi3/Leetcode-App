import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const list = vi.fn();
const snooze = vi.fn();
const close = vi.fn();
const createStore = vi.fn(() => ({ list, snooze, close }));
vi.mock('@/lib/auth/session', () => ({ getSession }));
vi.mock('@/lib/review-store', () => ({ createReviewStore: createStore }));

const request = (body: unknown, owner = 'user-1') => new Request('http://localhost', {
  method: 'POST', body: JSON.stringify(body), headers: { 'x-learning-owner': owner },
});

describe('/api/learner/reviews', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    createStore.mockReturnValue({ list, snooze, close });
    close.mockResolvedValue(undefined);
  });

  it('returns owned reviews with a linked practice activity', async () => {
    list.mockResolvedValue([{ id: 'review-1', conceptId: 'hash-maps', intervalDays: 2, repetitions: 1, dueAt: '2026-10-12T12:00:00.000Z' }]);
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'));
    await expect(response.json()).resolves.toMatchObject({ learnerId: 'user-1', reviews: [{ practiceItemId: 'pair-with-target-v1', label: 'Pair With Target' }] });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(list).toHaveBeenCalledWith('user-1');
    expect(close).toHaveBeenCalled();
  });

  it('validates and owner-scopes snooze requests', async () => {
    snooze.mockResolvedValue({ id: 'review-1', conceptId: 'hash-maps', dueAt: '2026-10-13T12:00:00.000Z' });
    const { POST } = await import('./route');
    const invalid = await POST(request({ reviewId: 'review-1', snoozeDays: 30 }));
    expect(invalid.status).toBe(400);
    const response = await POST(request({ reviewId: 'review-1', snoozeDays: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ learnerId: 'user-1', review: { label: 'Pair With Target', practiceItemId: 'pair-with-target-v1' } });
    expect(snooze).toHaveBeenCalledWith('user-1', 'review-1', 1);
  });

  it('checks account identity before parsing or opening persistence', async () => {
    const { GET, POST } = await import('./route');
    const stale = new Request('http://localhost', { method: 'POST', body: '{', headers: { 'x-learning-owner': 'other-user' } });
    expect((await POST(stale)).status).toBe(409);
    expect((await GET(new Request('http://localhost', { headers: { 'x-learning-owner': 'other-user' } }))).status).toBe(409);
    getSession.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(401);
    expect(createStore).not.toHaveBeenCalled();
  });

  it('distinguishes service failure from an empty review list and closes persistence', async () => {
    const { GET } = await import('./route');
    list.mockRejectedValue(new Error('private database details'));
    const response = await GET(new Request('http://localhost'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('database');
    expect(close).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@leetcode-app/database';
import { createReviewStore } from './review-store';

describe('review store', () => {
  it('creates a first spaced review and advances an existing interval', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'review-1', concept_id: 'hash-maps', interval_days: 2, repetitions: 1, due_at: '2026-10-14T12:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });
    const store = createReviewStore({ query } as unknown as DatabaseClient);

    await store.schedule('user-1', ['hash-maps'], 100, '2026-10-12T12:00:00.000Z');
    await store.schedule('user-1', ['hash-maps'], 90, '2026-10-14T12:00:00.000Z');

    expect(query.mock.calls[1][0]).toContain('INSERT INTO scheduled_reviews');
    expect(query.mock.calls[1][1]).toEqual(['user-1', 'hash-maps', 2, 1, '2026-10-14T12:00:00.000Z']);
    expect(query.mock.calls[3][0]).toContain('UPDATE scheduled_reviews');
    expect(query.mock.calls[3][1]).toEqual(['review-1', 'user-1', 4, 2, '2026-10-18T12:00:00.000Z']);
  });

  it('owner-scopes review snoozing', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const store = createReviewStore({ query } as unknown as DatabaseClient);
    await expect(store.snooze('user-1', 'review-1', 1)).resolves.toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), ['review-1', 'user-1', 1]);
  });
});

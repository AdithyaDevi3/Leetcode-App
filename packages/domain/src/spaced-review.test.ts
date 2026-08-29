import { describe, expect, it } from 'vitest';
import { scheduleReview } from './spaced-review';

describe('spaced review', () => {
  it('increases successful review intervals and resets after a weak result', () => {
    const current = { conceptId: 'hashing', intervalDays: 3, repetitions: 2, dueAt: '2026-08-29T00:00:00Z' };
    expect(scheduleReview(current, 'hashing', 90, '2026-08-29T00:00:00Z')).toMatchObject({ intervalDays: 6, repetitions: 3 });
    expect(scheduleReview(current, 'hashing', 40, '2026-08-29T00:00:00Z')).toMatchObject({ intervalDays: 1, repetitions: 0 });
  });
  it('rejects invalid scores', () => expect(() => scheduleReview(null, 'hashing', -1, '2026-08-29T00:00:00Z')).toThrow('out of range'));
});

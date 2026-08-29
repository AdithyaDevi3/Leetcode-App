import { describe, expect, it } from 'vitest';
import { canScheduleNotification, scheduleReviewNotification } from './notifications';

describe('notification scheduling', () => {
  it('respects channel enablement and quiet hours', () => {
    const at = new Date('2026-08-29T23:00:00Z');
    expect(canScheduleNotification({ channel: 'push', enabled: true, quietHoursStart: 22, quietHoursEnd: 7 }, at)).toBe(false);
    expect(canScheduleNotification({ channel: 'email', enabled: true }, at)).toBe(true);
  });
  it('schedules only allowed review channels', () => {
    expect(scheduleReviewNotification([{ channel: 'email', enabled: true }, { channel: 'push', enabled: false }], '2026-08-29T12:00:00Z')).toEqual([{ channel: 'email', scheduledAt: '2026-08-29T12:00:00.000Z', reason: 'review_due' }]);
  });
});

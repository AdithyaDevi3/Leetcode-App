import { describe, expect, it } from 'vitest';
import { recommendNextActivity } from './recommendations';

describe('recommendations', () => {
  it('selects an eligible, due activity and explains the choice', () => {
    const recommendation = recommendNextActivity([
      { contentId: 'blocked', prerequisiteReady: false, masteryGap: 100, reviewDue: true, recentlySeen: false, estimatedMinutes: 5 },
      { contentId: 'review', prerequisiteReady: true, masteryGap: 40, reviewDue: true, recentlySeen: false, estimatedMinutes: 10 },
    ]);
    expect(recommendation).toMatchObject({ contentId: 'review', reasons: expect.arrayContaining(['Review is due']) });
  });
  it('returns null when no prerequisites are satisfied', () => {
    expect(recommendNextActivity([{ contentId: 'blocked', prerequisiteReady: false, masteryGap: 100, reviewDue: true, recentlySeen: false, estimatedMinutes: 5 }])).toBeNull();
  });
});

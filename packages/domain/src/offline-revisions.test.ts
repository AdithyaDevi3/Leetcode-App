import { describe, expect, it } from 'vitest';
import { enqueueOfflineRevision, revisionsReadyToSync } from './offline-revisions';

describe('offline revisions', () => {
  it('keeps queue ordering and replaces duplicate idempotency keys', () => {
    const first = { idempotencyKey: 'a', accountId: 'u1', sessionId: 's', revisionNumber: 1, content: 'old', queuedAt: '2026-08-29T01:00:00Z' };
    const updated = { ...first, content: 'new' };
    const earlier = { ...first, idempotencyKey: 'b', revisionNumber: 2, queuedAt: '2026-08-29T00:00:00Z' };
    expect(enqueueOfflineRevision(enqueueOfflineRevision([first], updated), earlier).map((item) => item.content)).toEqual(['old', 'new']);
  });
  it('does not sync revisions for a different account', () => {
    const queue = [{ idempotencyKey: 'a', accountId: 'u1', sessionId: 's', revisionNumber: 1, content: 'x', queuedAt: '2026-08-29T00:00:00Z' }];
    expect(revisionsReadyToSync(queue, 'u2')).toEqual([]);
  });
});

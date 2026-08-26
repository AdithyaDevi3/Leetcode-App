import { beforeEach, describe, expect, it } from 'vitest';
import { resetAppealsForTests, resolveAppeal, submitAppeal, getAppealAudit } from './evaluation-appeals';

describe('evaluation appeals', () => {
  beforeEach(() => resetAppealsForTests());
  it('requires context and records an immutable resolution audit event', () => {
    const appeal = submitAppeal({ jobId: 'job-1', userId: 'user-1', findingId: 'lookup', context: 'The lookup is described in step three.' });
    const resolved = resolveAppeal(appeal.id, { reviewerId: 'reviewer-1', approved: true, reason: 'Evidence confirms the finding was satisfied.' });
    expect(resolved?.status).toBe('resolved');
    expect(getAppealAudit(appeal.id)).toHaveLength(1);
  });
  it('rejects a blank override reason', () => {
    const appeal = submitAppeal({ jobId: 'job-1', userId: 'user-1', findingId: 'lookup', context: 'More context' });
    expect(() => resolveAppeal(appeal.id, { reviewerId: 'reviewer-1', approved: false, reason: ' ' })).toThrow('Override reason is required');
  });
});

import { describe, expect, it } from 'vitest';
import { runAppealSecondPass } from './appeal-second-pass';

describe('appeal second pass', () => {
  it('routes cited contrary evidence to a distinct reviewer', () => {
    expect(runAppealSecondPass({ findingId: 'lookup', originalFindingStatus: 'revise', learnerContext: 'Step 3 describes the lookup.', evidenceReferences: ['span:20:45'] })).toMatchObject({ decision: 'needs_review' });
  });
  it('confirms unsupported appeals', () => {
    expect(runAppealSecondPass({ findingId: 'lookup', originalFindingStatus: 'revise', learnerContext: 'I disagree.', evidenceReferences: ['span:20:45'] })).toMatchObject({ decision: 'confirm' });
  });
});

import { describe, expect, it } from 'vitest';
import { deserializeLocalSystemDesignDraft } from './local-system-design';

const draft = {
  document: {
    title: 'Short links', requirements: ['Redirect quickly'], assumptions: ['Public links'],
    components: [{ id: 'api', label: 'API', kind: 'service' }], connections: [], failureNotes: ['Retry writes'],
  },
  submittedAt: '2026-08-30T12:00:00.000Z',
};

describe('local system-design draft', () => {
  it('restores a valid local draft', () => {
    expect(deserializeLocalSystemDesignDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it('rejects malformed local storage data', () => {
    expect(deserializeLocalSystemDesignDraft('{"document":{"title":42}}')).toBeNull();
  });
});

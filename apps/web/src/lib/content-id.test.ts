import { describe, expect, it } from 'vitest';

import { practiceItems } from './content';
import { fromPersistedContentId, toPersistedContentId } from './content-id';

describe('practice content identifiers', () => {
  it.each(practiceItems)('round-trips the persisted identifier for $label', (item) => {
    expect(fromPersistedContentId(toPersistedContentId(item.id))).toBe(item.id);
  });

  it('leaves future identifiers untouched', () => {
    expect(fromPersistedContentId('future-item')).toBe('future-item');
    expect(toPersistedContentId('future-item')).toBe('future-item');
  });
});

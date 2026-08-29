import { describe, expect, it } from 'vitest';
import { parseBookmarkInput, parseNoteInput, parseNotePatch } from './notes-bookmarks';

describe('notes and bookmarks input validation', () => {
  it('accepts content-scoped notes without a session', () => {
    expect(parseNoteInput({ contentId: 'content-1', body: '  Review the invariant.  ' })).toEqual({ contentId: 'content-1', sessionId: null, body: 'Review the invariant.', anchor: null });
  });
  it('rejects blank notes and overlong anchors', () => {
    expect(parseNoteInput({ contentId: 'content-1', body: ' ' })).toBeNull();
    expect(parseNotePatch({ body: 'valid', anchor: 'a'.repeat(501) })).toBeNull();
  });
  it('accepts a session bookmark and rejects an empty session id', () => {
    expect(parseBookmarkInput({ contentId: 'content-1', sessionId: 'session-1', label: 'Retry later' })).toEqual({ contentId: 'content-1', sessionId: 'session-1', label: 'Retry later' });
    expect(parseBookmarkInput({ contentId: 'content-1', sessionId: '' })).toBeNull();
  });
});

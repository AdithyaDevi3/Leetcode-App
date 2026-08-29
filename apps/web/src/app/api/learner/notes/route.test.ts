import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const listNotes = vi.fn(); const createNote = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/notes-bookmarks', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/notes-bookmarks')>()), createNotesBookmarksStore: () => ({ listNotes, createNote }) }));

describe('/api/learner/notes', () => {
  beforeEach(() => vi.resetAllMocks());
  it('lists only the authenticated learner notes', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); listNotes.mockResolvedValue([]);
    const { GET } = await import('./route');
    expect((await GET(new Request('http://localhost/api/learner/notes?contentId=content-1'))).status).toBe(200);
    expect(listNotes).toHaveBeenCalledWith('user-1', { contentId: 'content-1', sessionId: null });
  });
  it('creates an owned note', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); createNote.mockResolvedValue({ id: 'note-1' });
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ contentId: 'content-1', sessionId: 'session-1', body: 'Keep a seen set' }) }));
    expect(response.status).toBe(201);
    expect(createNote).toHaveBeenCalledWith('user-1', { contentId: 'content-1', sessionId: 'session-1', body: 'Keep a seen set', anchor: null });
  });
  it('does not expose an unowned session as creatable', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); createNote.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ contentId: 'content-1', sessionId: 'other-session', body: 'Private' }) }))).status).toBe(404);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const listBookmarks = vi.fn(); const createBookmark = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/notes-bookmarks', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/notes-bookmarks')>()), createNotesBookmarksStore: () => ({ listBookmarks, createBookmark }) }));

describe('/api/learner/bookmarks', () => {
  beforeEach(() => vi.resetAllMocks());
  it('lists bookmarks under the authenticated owner', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); listBookmarks.mockResolvedValue([]);
    const { GET } = await import('./route');
    expect((await GET(new Request('http://localhost/api/learner/bookmarks'))).status).toBe(200);
    expect(listBookmarks).toHaveBeenCalledWith('user-1', { contentId: null, sessionId: null });
  });
  it('creates an idempotent content bookmark', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); createBookmark.mockResolvedValue({ id: 'bookmark-1' });
    const { POST } = await import('./route');
    expect((await POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ contentId: 'content-1', label: 'Graph review' }) }))).status).toBe(201);
    expect(createBookmark).toHaveBeenCalledWith('user-1', { contentId: 'content-1', sessionId: null, label: 'Graph review' });
  });
});

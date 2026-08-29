import { describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const deleteBookmark = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/notes-bookmarks', () => ({ createNotesBookmarksStore: () => ({ deleteBookmark }) }));

describe('/api/learner/bookmarks/[bookmarkId]', () => {
  it('deletes only an owned bookmark', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); deleteBookmark.mockResolvedValue(true);
    const { DELETE } = await import('./route');
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ bookmarkId: 'bookmark-1' }) });
    expect(response.status).toBe(204); expect(deleteBookmark).toHaveBeenCalledWith('bookmark-1', 'user-1');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const requireAuth = vi.fn(); const updateNote = vi.fn(); const deleteNote = vi.fn();
vi.mock('@/lib/auth/session', () => ({ requireAuth }));
vi.mock('@/lib/notes-bookmarks', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/notes-bookmarks')>()), createNotesBookmarksStore: () => ({ updateNote, deleteNote }) }));
const context = { params: Promise.resolve({ noteId: 'note-1' }) };

describe('/api/learner/notes/[noteId]', () => {
  beforeEach(() => vi.resetAllMocks());
  it('updates a note using the authenticated owner scope', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-1' } }); updateNote.mockResolvedValue({ id: 'note-1' });
    const { PATCH } = await import('./route');
    expect((await PATCH(new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ body: 'Updated' }) }), context)).status).toBe(200);
    expect(updateNote).toHaveBeenCalledWith('note-1', 'user-1', { body: 'Updated', anchor: null });
  });
  it('treats another learner note as absent', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user-2' } }); deleteNote.mockResolvedValue(false);
    const { DELETE } = await import('./route');
    expect((await DELETE(new Request('http://localhost', { method: 'DELETE' }), context)).status).toBe(404);
    expect(deleteNote).toHaveBeenCalledWith('note-1', 'user-2');
  });
});

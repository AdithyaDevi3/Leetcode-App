import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createNotesBookmarksStore, parseNotePatch } from '@/lib/notes-bookmarks';

type Context = { params: Promise<{ noteId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const session = await requireAuth();
    const input = parseNotePatch(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ error: 'A note body of at most 10000 characters is required' }, { status: 400 });
    const note = await createNotesBookmarksStore().updateNote((await params).noteId, session.user.id, input);
    return note ? NextResponse.json({ note }) : NextResponse.json({ error: 'Note not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const session = await requireAuth();
    const deleted = await createNotesBookmarksStore().deleteNote((await params).noteId, session.user.id);
    return deleted ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Note not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}

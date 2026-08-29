import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createNotesBookmarksStore } from '@/lib/notes-bookmarks';

type Context = { params: Promise<{ bookmarkId: string }> };

export async function DELETE(_: Request, { params }: Context) {
  try {
    const session = await requireAuth();
    const deleted = await createNotesBookmarksStore().deleteBookmark((await params).bookmarkId, session.user.id);
    return deleted ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Bookmark not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to delete bookmark' }, { status: 500 });
  }
}

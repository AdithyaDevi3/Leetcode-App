import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createNotesBookmarksStore, parseBookmarkInput } from '@/lib/notes-bookmarks';

const queryFilters = (request: Request) => {
  const url = new URL(request.url);
  return { contentId: url.searchParams.get('contentId'), sessionId: url.searchParams.get('sessionId') };
};

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    return NextResponse.json({ bookmarks: await createNotesBookmarksStore().listBookmarks(session.user.id, queryFilters(request)) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch bookmarks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const input = parseBookmarkInput(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ error: 'contentId is required and label must be at most 160 characters' }, { status: 400 });
    const bookmark = await createNotesBookmarksStore().createBookmark(session.user.id, input);
    if (!bookmark) return NextResponse.json({ error: 'Practice session was not found' }, { status: 404 });
    return NextResponse.json({ bookmark }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to create bookmark' }, { status: 500 });
  }
}

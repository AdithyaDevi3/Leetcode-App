import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createNotesBookmarksStore, parseNoteInput } from '@/lib/notes-bookmarks';

const queryFilters = (request: Request) => {
  const url = new URL(request.url);
  return { contentId: url.searchParams.get('contentId'), sessionId: url.searchParams.get('sessionId') };
};

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    return NextResponse.json({ notes: await createNotesBookmarksStore().listNotes(session.user.id, queryFilters(request)) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const input = parseNoteInput(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ error: 'contentId and a note body of at most 10000 characters are required' }, { status: 400 });
    const note = await createNotesBookmarksStore().createNote(session.user.id, input);
    if (!note) return NextResponse.json({ error: 'Practice session was not found' }, { status: 404 });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
  }
}

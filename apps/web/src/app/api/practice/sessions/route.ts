import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { startOrResumePracticeSession } from '@/lib/practice-api';
import { practiceOwnerMatches } from '@/lib/practice-sync-contract';

export async function GET(request: Request) {
  try {
    const owner = await getPracticeOwner();
    if (!practiceOwnerMatches(request, owner)) return NextResponse.json({ code: 'owner_changed', error: 'Your account changed. Reopening your saved workspace.' }, { status: 409 });
    const contentId = new URL(request.url).searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    const result = await startOrResumePracticeSession({
      owner,
      contentId,
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Failed to load practice session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const owner = await getPracticeOwner();
    if (!practiceOwnerMatches(request, owner)) return NextResponse.json({ code: 'owner_changed', error: 'Your account changed. Reopening your saved workspace.' }, { status: 409 });
    const body = (await request.json().catch(() => null)) as { contentId?: unknown } | null;

    if (!body || typeof body.contentId !== 'string' || body.contentId.trim().length === 0) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    const result = await startOrResumePracticeSession({
      owner,
      contentId: body.contentId,
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to start practice session' }, { status: 500 });
  }
}

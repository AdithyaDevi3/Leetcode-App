import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { startOrResumePracticeSession } from '@/lib/practice-api';

export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const contentId = new URL(request.url).searchParams.get('contentId');

    if (!contentId) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    const result = await startOrResumePracticeSession({
      userId: session.user.id,
      contentId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to load practice session' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const body = (await request.json().catch(() => null)) as { contentId?: unknown } | null;

    if (!body || typeof body.contentId !== 'string' || body.contentId.trim().length === 0) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 });
    }

    const result = await startOrResumePracticeSession({
      userId: session.user.id,
      contentId: body.contentId,
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to start practice session' }, { status: 500 });
  }
}
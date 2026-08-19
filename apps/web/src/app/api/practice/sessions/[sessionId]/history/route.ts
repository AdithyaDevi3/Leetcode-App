import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getPracticeSessionHistory } from '@/lib/practice-api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireAuth();
    const { sessionId } = await params;

    const result = await getPracticeSessionHistory({
      userId: session.user.id,
      sessionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized: Authentication required') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      if (error.message === 'Practice session not found') {
        return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to load practice session history' }, { status: 500 });
  }
}
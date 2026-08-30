import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { getPracticeSessionHistory } from '@/lib/practice-api';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const owner = await getPracticeOwner();
    const { sessionId } = await params;

    const result = await getPracticeSessionHistory({
      owner,
      sessionId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Practice session not found') {
        return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to load practice session history' }, { status: 500 });
  }
}

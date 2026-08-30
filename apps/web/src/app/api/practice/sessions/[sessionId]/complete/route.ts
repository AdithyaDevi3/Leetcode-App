import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { completePracticeSession } from '@/lib/practice-api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const owner = await getPracticeOwner();
    const { sessionId } = await params;
    const body = (await request.json().catch(() => null)) as { completed?: unknown; currentStage?: unknown } | null;

    const completed = typeof body?.completed === 'boolean' ? body.completed : true;
    const currentStage =
      body?.currentStage === 'understand' ||
      body?.currentStage === 'match' ||
      body?.currentStage === 'plan' ||
      body?.currentStage === 'implement' ||
      body?.currentStage === 'evaluate'
        ? body.currentStage
        : undefined;

    const result = await completePracticeSession({
      owner,
      sessionId,
      completed,
      currentStage,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Practice session not found') {
      return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to complete practice session' }, { status: 500 });
  }
}

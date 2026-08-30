import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { appendPracticeRevision } from '@/lib/practice-api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const owner = await getPracticeOwner();
    const { sessionId } = await params;
    const body = (await request.json().catch(() => null)) as {
      draft?: unknown;
      currentStage?: unknown;
    } | null;

    if (!body || typeof body.draft !== 'string' || body.draft.trim().length === 0) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 });
    }

    const currentStage =
      body.currentStage === 'understand' ||
      body.currentStage === 'match' ||
      body.currentStage === 'plan' ||
      body.currentStage === 'implement' ||
      body.currentStage === 'evaluate'
        ? body.currentStage
        : undefined;

    const result = await appendPracticeRevision({
      owner,
      sessionId,
      draft: body.draft,
      currentStage,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Practice session not found') {
        return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to save practice revision' }, { status: 500 });
  }
}

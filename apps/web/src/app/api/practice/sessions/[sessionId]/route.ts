import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { appendPracticeRevision } from '@/lib/practice-api';
import { deserializePracticeSession } from '@/lib/practice-session';

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
      state?: unknown;
    } | null;

    if (!body || typeof body.draft !== 'string' || body.draft.length > 50_000) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 });
    }

    const serializedState = body.state === undefined ? null : JSON.stringify(body.state);
    if (serializedState && serializedState.length > 250_000) {
      return NextResponse.json({ error: 'workspace state is too large' }, { status: 400 });
    }
    const workspaceState = serializedState ? deserializePracticeSession(serializedState) : undefined;
    if (body.state !== undefined && !workspaceState) {
      return NextResponse.json({ error: 'workspace state is invalid' }, { status: 400 });
    }

    if (!body.draft.trim() && !workspaceState?.code.trim()) {
      return NextResponse.json({ error: 'A reasoning draft or code workspace is required' }, { status: 400 });
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
      workspaceState: workspaceState ? { ...workspaceState, draft: body.draft.trim() } : undefined,
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

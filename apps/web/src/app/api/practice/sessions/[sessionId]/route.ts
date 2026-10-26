import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';
import { appendPracticeRevision } from '@/lib/practice-api';
import { deserializePracticeSession } from '@/lib/practice-session';
import { practiceOwnerMatches, PracticeRevisionConflict } from '@/lib/practice-sync-contract';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const owner = await getPracticeOwner();
    if (!practiceOwnerMatches(request, owner)) return NextResponse.json({ code: 'owner_changed', error: 'Your account changed. Reopening your saved workspace.' }, { status: 409 });
    const { sessionId } = await params;
    const body = (await request.json().catch(() => null)) as {
      draft?: unknown;
      currentStage?: unknown;
      state?: unknown;
      expectedRevisionNumber?: unknown;
      requestKey?: unknown;
    } | null;

    if (!body || typeof body.draft !== 'string' || body.draft.length > 50_000) {
      return NextResponse.json({ error: 'draft is required' }, { status: 400 });
    }

    const conditional = body.expectedRevisionNumber !== undefined || body.requestKey !== undefined;
    if (conditional && (!Number.isSafeInteger(body.expectedRevisionNumber) || (body.expectedRevisionNumber as number) < 0
      || typeof body.requestKey !== 'string' || !body.requestKey.trim() || body.requestKey.length > 128)) {
      return NextResponse.json({ error: 'A valid save key and expected revision are required together' }, { status: 400 });
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
      ...(conditional ? { expectedRevisionNumber: body.expectedRevisionNumber as number, requestKey: (body.requestKey as string).trim() } : {}),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof PracticeRevisionConflict) {
      return NextResponse.json({ code: error.code, error: error.message, currentRevisionNumber: error.currentRevisionNumber }, { status: 409 });
    }
    if (error instanceof Error) {
      if (error.message === 'Practice session not found') {
        return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to save practice revision' }, { status: 500 });
  }
}

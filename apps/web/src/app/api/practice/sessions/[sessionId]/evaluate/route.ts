import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { evaluatePracticeRevision } from '@/lib/practice-api';
import { enqueueEvaluationJob, runEvaluationJob } from '@/lib/evaluation-jobs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireAuth();
    const { sessionId } = await params;
    const body = (await request.json().catch(() => null)) as { revisionNumber?: unknown } | null;

    if (!body || typeof body.revisionNumber !== 'number') {
      return NextResponse.json({ error: 'revisionNumber is required' }, { status: 400 });
    }

    const job = enqueueEvaluationJob({
      userId: session.user.id,
      sessionId,
      revisionNumber: body.revisionNumber,
    });

    await runEvaluationJob(job.id, async () =>
      evaluatePracticeRevision({
        userId: session.user.id,
        sessionId,
        revisionNumber: body.revisionNumber,
      }),
    );

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      queuePosition: job.queuePosition,
      queuedAt: job.queuedAt,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Unauthorized: Authentication required') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      if (error.message === 'Practice session not found') {
        return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
      }

      if (error.message === 'Practice revision not found') {
        return NextResponse.json({ error: 'Practice revision not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to evaluate practice revision' }, { status: 500 });
  }
}
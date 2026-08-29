import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { evaluatePracticeRevision } from '@/lib/practice-api';
import { enqueueRuntimeJob, runRuntimeJob } from '@/lib/evaluation-job-runtime';
import { takeRateLimit } from '@/lib/rate-limit';

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

    const rateLimit = takeRateLimit(`evaluation:${session.user.id}`, {
      limit: Number(process.env.EVALUATION_SUBMISSIONS_PER_MINUTE ?? 12),
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many evaluation submissions' }, {
        status: 429,
        headers: { 'retry-after': String(rateLimit.retryAfterSeconds) },
      });
    }

    const job = await enqueueRuntimeJob({
      userId: session.user.id,
      sessionId,
      revisionNumber: body.revisionNumber,
    });

    await runRuntimeJob(job.id, async () =>
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

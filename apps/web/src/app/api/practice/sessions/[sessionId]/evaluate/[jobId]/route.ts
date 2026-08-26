import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { cancelEvaluationJob, getEvaluationJob } from '@/lib/evaluation-jobs';

type RouteContext = { params: Promise<{ sessionId: string; jobId: string }> };

function visibleJob(job: NonNullable<ReturnType<typeof getEvaluationJob>>) {
  return {
    jobId: job.id,
    sessionId: job.sessionId,
    revisionNumber: job.revisionNumber,
    evaluatorVersion: job.evaluatorVersion,
    rubricVersion: job.rubricVersion,
    status: job.status,
    queuePosition: job.queuePosition,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    ...(job.status === 'completed' ? { result: job.result } : {}),
    ...(job.status === 'failed' || job.status === 'canceled' ? { error: job.error } : {}),
  };
}

async function findOwnedJob(sessionId: string, jobId: string, userId: string) {
  const job = getEvaluationJob(jobId);
  if (!job || job.sessionId !== sessionId || job.userId !== userId) return null;
  return job;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await requireAuth();
    const { sessionId, jobId } = await params;
    const job = await findOwnedJob(sessionId, jobId, session.user.id);
    if (!job) return NextResponse.json({ error: 'Evaluation job not found' }, { status: 404 });
    return NextResponse.json(visibleJob(job));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch evaluation job' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await requireAuth();
    const { sessionId, jobId } = await params;
    const job = await findOwnedJob(sessionId, jobId, session.user.id);
    if (!job) return NextResponse.json({ error: 'Evaluation job not found' }, { status: 404 });
    const canceled = cancelEvaluationJob(jobId);
    return NextResponse.json(visibleJob(canceled ?? job));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to cancel evaluation job' }, { status: 500 });
  }
}

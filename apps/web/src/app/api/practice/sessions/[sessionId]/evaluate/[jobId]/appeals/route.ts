import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getEvaluationJob } from '@/lib/evaluation-jobs';
import { listAppeals, submitAppeal } from '@/lib/evaluation-appeals';

type Context = { params: Promise<{ sessionId: string; jobId: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    const session = await requireAuth(); const { sessionId, jobId } = await params;
    const job = getEvaluationJob(jobId);
    if (!job || job.sessionId !== sessionId || job.userId !== session.user.id) return NextResponse.json({ error: 'Evaluation job not found' }, { status: 404 });
    const body = await request.json().catch(() => null) as { findingId?: unknown; context?: unknown } | null;
    if (!body || typeof body.findingId !== 'string' || typeof body.context !== 'string' || !body.context.trim()) return NextResponse.json({ error: 'findingId and context are required' }, { status: 400 });
    const appeal = submitAppeal({ jobId, userId: session.user.id, findingId: body.findingId, context: body.context.trim() });
    return NextResponse.json(appeal, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to submit appeal' }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const session = await requireAuth(); const { sessionId, jobId } = await params; const job = getEvaluationJob(jobId);
    if (!job || job.sessionId !== sessionId || job.userId !== session.user.id) return NextResponse.json({ error: 'Evaluation job not found' }, { status: 404 });
    return NextResponse.json({ appeals: listAppeals().filter((appeal) => appeal.jobId === jobId && appeal.userId === session.user.id) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch appeals' }, { status: 500 });
  }
}

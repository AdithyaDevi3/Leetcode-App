import { NextResponse } from 'next/server';
import { validateExecutionRequest, type ExecutionRequest } from '@leetcode-app/domain';
import { requireAuth } from '@/lib/auth/session';
import { createExecutionJobStore } from '@/lib/execution-jobs-postgres';
import { validateExecutionPolicy } from '@/lib/sandbox/execution-policy';
import { getPracticeSessionHistory } from '@/lib/practice-api';
import { takeRateLimit } from '@/lib/rate-limit';

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    if (process.env.CODE_EXECUTION_ENABLED !== 'true') return NextResponse.json({ error: 'Code execution is unavailable' }, { status: 503 });
    const session = await requireAuth();
    const { sessionId } = await params;
    const body = await request.json().catch(() => null) as ExecutionRequest | null;
    if (!body) return NextResponse.json({ error: 'Execution request is required' }, { status: 400 });
    const errors = [...validateExecutionRequest(body), ...validateExecutionPolicy(body)];
    if (errors.length) return NextResponse.json({ error: 'Invalid execution request', details: errors }, { status: 400 });
    const rateLimit = takeRateLimit(`execution:${session.user.id}`, {
      limit: Number(process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES ?? 10),
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many execution submissions' }, {
      status: 429,
      headers: { 'retry-after': String(rateLimit.retryAfterSeconds) },
    });
    await getPracticeSessionHistory({ owner: { kind: 'user', id: session.user.id }, sessionId });
    const job = await createExecutionJobStore().enqueue({ userId: session.user.id, sessionId, request: body });
    return NextResponse.json({ jobId: job.id, status: job.status, queuedAt: job.queuedAt }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof Error && error.message === 'Practice session not found') return NextResponse.json({ error: 'Practice session not found' }, { status: 404 });
    return NextResponse.json({ error: 'Failed to queue execution' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createExecutionJobStore } from '@/lib/execution-jobs-postgres';

export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string; jobId: string }> }) {
  try {
    const session = await requireAuth();
    const { sessionId, jobId } = await params;
    const job = await createExecutionJobStore().findOwned(jobId, session.user.id, sessionId);
    if (!job) return NextResponse.json({ error: 'Execution job not found' }, { status: 404 });
    return NextResponse.json({ jobId: job.id, status: job.status, queuedAt: job.queuedAt, startedAt: job.startedAt, completedAt: job.completedAt, result: job.result, error: job.error });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch execution job' }, { status: 500 });
  }
}

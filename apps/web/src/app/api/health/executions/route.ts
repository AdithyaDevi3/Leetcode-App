import { NextResponse } from 'next/server';
import { createExecutionJobStore } from '@/lib/execution-jobs-postgres';

export async function GET() {
  if (process.env.CODE_EXECUTION_ENABLED !== 'true') {
    return NextResponse.json({ status: 'disabled', service: 'execution-queue' });
  }
  try {
    const metrics = await createExecutionJobStore().metrics();
    const maxQueuedAgeMs = Number(process.env.EXECUTION_QUEUE_MAX_AGE_MS ?? 60_000);
    const status = metrics.oldestQueuedAgeMs > maxQueuedAgeMs ? 'degraded' : 'ok';
    return NextResponse.json({ status, service: 'execution-queue', metrics }, { status: status === 'ok' ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: 'unavailable', service: 'execution-queue' }, { status: 503 });
  }
}

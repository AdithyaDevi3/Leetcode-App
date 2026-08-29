import { NextResponse } from 'next/server';
import { getRuntimeQueueMetrics } from '@/lib/evaluation-job-runtime';

export async function GET() {
  try {
    const metrics = await getRuntimeQueueMetrics();
    const maxQueuedAgeMs = Number(process.env.EVALUATION_QUEUE_MAX_AGE_MS ?? 60_000);
    const status = metrics.oldestQueuedAgeMs > maxQueuedAgeMs ? 'degraded' : 'ok';
    return NextResponse.json({ status, service: 'evaluation-queue', metrics }, { status: status === 'ok' ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: 'unavailable', service: 'evaluation-queue' }, { status: 503 });
  }
}

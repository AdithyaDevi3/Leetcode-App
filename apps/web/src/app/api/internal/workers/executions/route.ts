import { NextResponse } from 'next/server';
import { processNextExecutionJob } from '@/workers/execution-worker';

export async function POST(request: Request) {
  const token = process.env.EXECUTION_WORKER_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = typeof body.limit === 'number' && Number.isInteger(body.limit) ? Math.max(1, Math.min(10, body.limit)) : 1;
  const processed = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextExecutionJob();
    if (!result) break;
    processed.push(result);
  }
  return NextResponse.json({ processed });
}

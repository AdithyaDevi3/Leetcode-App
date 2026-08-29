import { NextResponse } from 'next/server';
import { processNextEvaluationJob } from '@/workers/evaluation-worker';

const parseLimit = (value: unknown) => typeof value === 'number' && Number.isInteger(value) ? Math.max(1, Math.min(20, value)) : 1;

export async function POST(request: Request) {
  const token = process.env.EVALUATION_WORKER_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const processed = [];
  for (let count = 0; count < parseLimit(body.limit); count += 1) {
    const result = await processNextEvaluationJob();
    if (!result) break;
    processed.push(result);
  }
  return NextResponse.json({ processed });
}

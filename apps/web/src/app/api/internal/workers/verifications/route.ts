import { NextResponse } from 'next/server';
import { processNextVerificationJob } from '@/workers/verification-worker';

const parseLimit = (_value: unknown) => 1;

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const token = process.env.VERIFICATION_WORKER_TOKEN;
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.CODE_EXECUTION_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Assignment verification is unavailable' }, { status: 503 });
  }
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const processed = [];
  for (let count = 0; count < parseLimit(body.limit); count += 1) {
    const result = await processNextVerificationJob();
    if (!result) break;
    processed.push(result);
  }
  return NextResponse.json({ processed });
}

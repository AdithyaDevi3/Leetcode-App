import { NextResponse } from 'next/server';
import { type ExecutionRequest, validateExecutionRequest } from '@leetcode-app/domain';
import { SharedCodingRoomAccessError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';
import { executionLimits, sanitizeSandboxOutput, validateExecutionPolicy } from '@/lib/sandbox/execution-policy';
import { createConfiguredSandbox } from '@/lib/sandbox/runtime';
import { takeRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(_request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    if (process.env.CODE_EXECUTION_ENABLED !== 'true') return NextResponse.json({ error: 'Code execution is unavailable.' }, { status: 503, headers });
    const { roomId } = await params;
    if (!id(roomId)) throw new SharedCodingRoomValidationError();
    const access = await readSharedCodingRoomData(async (repository, actorId) => {
      const source = await repository.runnableSource(roomId);
      const request: ExecutionRequest = { ...source, limits: executionLimits };
      const errors = [...validateExecutionRequest(request), ...validateExecutionPolicy(request)];
      if (errors.length) throw new SharedCodingRoomValidationError();
      const limit = await takeRateLimit(`shared-room-run:${actorId}`, { limit: Number(process.env.EXECUTION_SUBMISSIONS_PER_TEN_MINUTES ?? 10), windowMs: 10 * 60_000 });
      if (!limit.allowed) return { limited: limit.retryAfterSeconds };
      const result = await createConfiguredSandbox().execute(request);
      return { run: { ...result, stdout: sanitizeSandboxOutput(result.stdout), stderr: sanitizeSandboxOutput(result.stderr) } };
    });
    if (access.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to run this room.' }, { status: 401, headers });
    if (access.status === 'forbidden') return NextResponse.json({ error: 'You cannot run this room.' }, { status: 403, headers });
    if ('limited' in access.data) return NextResponse.json({ error: 'Too many execution attempts. Try again shortly.' }, { status: 429, headers: { ...headers, 'retry-after': String(access.data.limited) } });
    return NextResponse.json(access.data, { headers });
  } catch (error) {
    const status = error instanceof SharedCodingRoomAccessError ? 404 : error instanceof SharedCodingRoomValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? 'Code execution could not be completed. Try again.' : (error as Error).message }, { status, headers });
  }
}

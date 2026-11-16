import { NextResponse } from 'next/server';
import { SharedCodingRoomAccessError, SharedCodingRoomConflictError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function PUT(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params; const body: unknown = await request.json();
    if (!id(roomId) || !body || typeof body !== 'object' || Array.isArray(body)) throw new SharedCodingRoomValidationError();
    const input = body as Record<string, unknown>;
    if (!Number.isSafeInteger(input.expectedControlRevision) || typeof input.expectedControlRevision !== 'number' || input.expectedControlRevision < 1 || !['lobby', 'prompt', 'workspace', 'review'].includes(input.stage as string)) throw new SharedCodingRoomValidationError();
    const result = await readSharedCodingRoomData(repository => repository.setInterviewStage({ roomId, expectedControlRevision: input.expectedControlRevision as number, stage: input.stage as never, prompt: input.prompt as string | undefined }));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to control this interview.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot control this interview.' }, { status: 403, headers });
    return NextResponse.json(result.data, { headers });
  } catch (error) {
    const status = error instanceof SharedCodingRoomConflictError ? 409 : error instanceof SharedCodingRoomAccessError ? 404 : error instanceof SharedCodingRoomValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? 'The interview could not be updated.' : (error as Error).message }, { status, headers });
  }
}

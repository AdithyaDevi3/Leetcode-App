import { NextResponse } from 'next/server';
import { SharedCodingRoomAccessError, SharedCodingRoomConflictError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function failure(error: unknown) {
  if (error instanceof SharedCodingRoomAccessError) return NextResponse.json({ error: error.message }, { status: 404, headers });
  if (error instanceof SharedCodingRoomConflictError) return NextResponse.json({ error: error.message }, { status: 409, headers });
  if (error instanceof SharedCodingRoomValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers });
  return NextResponse.json({ error: 'The shared coding room is unavailable.' }, { status: 500, headers });
}
export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params; if (!id(roomId)) throw new SharedCodingRoomValidationError();
    const search = new URL(request.url).searchParams;
    const afterValue = search.get('afterRevision');
    if (afterValue !== null) {
      const requestedRevision = Number(afterValue);
      const controlValue = search.get('afterControlRevision');
      const requestedControlRevision = controlValue === null ? 0 : Number(controlValue);
      if (!Number.isSafeInteger(requestedRevision) || requestedRevision < 0 || !Number.isSafeInteger(requestedControlRevision) || requestedControlRevision < 0) throw new SharedCodingRoomValidationError();
      const result = await readSharedCodingRoomData(repository => repository.readUpdate(roomId, requestedRevision, requestedControlRevision));
      if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to open this shared coding room.' }, { status: 401, headers });
      if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot open this shared coding room.' }, { status: 403, headers });
      return NextResponse.json(result.data, { headers });
    }
    const result = await readSharedCodingRoomData(repository => repository.read(roomId));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to open this shared coding room.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot open this shared coding room.' }, { status: 403, headers });
    return NextResponse.json(result.data, { headers });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params, body: unknown = await request.json();
    if (!id(roomId) || !body || typeof body !== 'object' || Array.isArray(body)) throw new SharedCodingRoomValidationError();
    const input = body as Record<string, unknown>;
    const result = await readSharedCodingRoomData(repository => repository.saveSnapshot({ roomId, expectedRevision: input.expectedRevision as number, language: input.language as never, source: input.source as string }));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to update this shared coding room.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot update this shared coding room.' }, { status: 403, headers });
    return NextResponse.json(result.data, { headers });
  } catch (error) { return failure(error); }
}

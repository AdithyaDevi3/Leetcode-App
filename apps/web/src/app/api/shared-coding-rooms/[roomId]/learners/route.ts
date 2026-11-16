import { NextResponse } from 'next/server';
import { SharedCodingRoomAccessError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function GET(_request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    if (!id(roomId)) throw new SharedCodingRoomValidationError();
    const result = await readSharedCodingRoomData(repository => repository.listInvitees(roomId));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to view class members.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot invite members to this room.' }, { status: 403, headers });
    return NextResponse.json({ learners: result.data }, { headers });
  } catch (error) {
    const status = error instanceof SharedCodingRoomAccessError ? 404 : error instanceof SharedCodingRoomValidationError ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? 'Class members are unavailable.' : (error as Error).message }, { status, headers });
  }
}

import { NextResponse } from 'next/server';
import { SharedCodingRoomAccessError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function POST(_request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params;
    const result = await readSharedCodingRoomData(repository => repository.join(roomId));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to join a shared coding room.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot join this shared coding room.' }, { status: 403, headers });
    return NextResponse.json(result.data, { headers });
  } catch (error) {
    const status = error instanceof SharedCodingRoomValidationError ? 400 : error instanceof SharedCodingRoomAccessError ? 404 : 500;
    return NextResponse.json({ error: status === 500 ? 'The shared coding room is unavailable.' : error instanceof Error ? error.message : 'The shared coding room is unavailable.' }, { status, headers });
  }
}

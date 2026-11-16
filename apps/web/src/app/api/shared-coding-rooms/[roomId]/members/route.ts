import { NextResponse } from 'next/server';
import { SharedCodingRoomAccessError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function failure(error: unknown) { if (error instanceof SharedCodingRoomAccessError) return NextResponse.json({ error: error.message }, { status: 404, headers }); if (error instanceof SharedCodingRoomValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers }); return NextResponse.json({ error: 'The room member request failed.' }, { status: 500, headers }); }

export async function PUT(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params; const body: unknown = await request.json();
    if (!id(roomId) || !body || typeof body !== 'object' || Array.isArray(body)) throw new SharedCodingRoomValidationError();
    const input = body as Record<string, unknown>;
    if (!id(input.userId) || (input.role !== 'editor' && input.role !== 'viewer' && input.role !== 'interviewee')) throw new SharedCodingRoomValidationError();
    const userId = input.userId, role = input.role;
    const result = await readSharedCodingRoomData(repository => repository.invite({ roomId, userId, role }));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to invite room members.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot invite room members.' }, { status: 403, headers });
    return NextResponse.json(result.data, { headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await params; const body: unknown = await request.json();
    if (!id(roomId) || !body || typeof body !== 'object' || Array.isArray(body)) throw new SharedCodingRoomValidationError();
    const userId = (body as Record<string, unknown>).userId;
    if (!id(userId)) throw new SharedCodingRoomValidationError();
    const result = await readSharedCodingRoomData(repository => repository.revoke(roomId, userId));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to remove room members.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot remove room members.' }, { status: 403, headers });
    return NextResponse.json(result.data, { headers });
  } catch (error) { return failure(error); }
}

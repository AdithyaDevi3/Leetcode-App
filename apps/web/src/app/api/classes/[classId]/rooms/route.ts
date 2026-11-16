import { NextResponse } from 'next/server';
import { SharedCodingRoomAccessError, SharedCodingRoomValidationError } from '@leetcode-app/database';
import { readSharedCodingRoomData } from '@/lib/shared-coding-room-access';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function failure(error: unknown) {
  if (error instanceof SharedCodingRoomAccessError) return NextResponse.json({ error: error.message }, { status: 404, headers });
  if (error instanceof SharedCodingRoomValidationError) return NextResponse.json({ error: error.message }, { status: 400, headers });
  return NextResponse.json({ error: 'The shared coding room is unavailable.' }, { status: 500, headers });
}

export async function GET(_request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params; if (!id(classId)) throw new SharedCodingRoomValidationError();
    const result = await readSharedCodingRoomData(repository => repository.list(classId));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to view shared coding rooms.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot view shared coding rooms.' }, { status: 403, headers });
    return NextResponse.json({ rooms: result.data }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ classId: string }> }) {
  try {
    const { classId } = await params, body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SharedCodingRoomValidationError();
    const input = body as Record<string, unknown>;
    if (!id(classId) || !id(input.roomId)) throw new SharedCodingRoomValidationError();
    const roomId = input.roomId;
    const result = await readSharedCodingRoomData(repository => repository.create({ roomId, classId, title: input.title as string, language: input.language as never, source: input.source as string, mode: input.mode as never, interviewPrompt: input.interviewPrompt as string | undefined }));
    if (result.status === 'unauthenticated') return NextResponse.json({ error: 'Sign in to create a shared coding room.' }, { status: 401, headers });
    if (result.status === 'forbidden') return NextResponse.json({ error: 'You cannot create a shared coding room.' }, { status: 403, headers });
    return NextResponse.json(result.data, { status: 201, headers });
  } catch (error) { return failure(error); }
}

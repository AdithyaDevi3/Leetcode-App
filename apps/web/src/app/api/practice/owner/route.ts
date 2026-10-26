import { NextResponse } from 'next/server';
import { getPracticeOwner } from '@/lib/auth/session';

export async function GET() {
  try {
    return NextResponse.json({ owner: await getPracticeOwner() }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Practice identity is unavailable' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

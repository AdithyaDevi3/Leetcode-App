import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    return NextResponse.json({ viewer: session?.user ?? null });
  } catch {
    return NextResponse.json({ viewer: null });
  }
}

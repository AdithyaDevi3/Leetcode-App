import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { listPracticeHistory } from '@/lib/practice-api';

export async function GET() {
  try {
    const session = await requireAuth();
    return NextResponse.json({ sessions: await listPracticeHistory(session.user.id) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load practice history' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { mergeGuestProgressIntoUser, requireAuth } from '@/lib/auth/session';

/**
 * Explicit, retry-safe guest upgrade endpoint. Sign-in and email confirmation
 * also perform this merge automatically.
 */
export async function POST() {
  try {
    const session = await requireAuth();
    const result = await mergeGuestProgressIntoUser(session.user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to merge guest progress' }, { status: 500 });
  }
}

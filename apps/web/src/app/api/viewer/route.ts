import { NextResponse } from 'next/server';

import { getAdministrationAccess } from '@/lib/admin/authorization';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };
  try {
    const session = await getSession({ failOnAuthError: true });
    if (!session) return NextResponse.json({ viewer: null }, { headers });
    let canAccessAdministration = false;
    try {
      const access = await getAdministrationAccess();
      canAccessAdministration = access.status === 'authorized';
    } catch {
      // Admin availability must not erase a valid learner identity from navigation.
    }
    return NextResponse.json({ viewer: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      canAccessAdministration,
    } }, { headers });
  } catch {
    return NextResponse.json({ error: 'Your signed-in account could not be verified. Please try again.' }, { status: 503, headers });
  }
}

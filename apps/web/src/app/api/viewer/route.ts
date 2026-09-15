import { NextResponse } from 'next/server';

import { getAdministrationAccess } from '@/lib/admin/authorization';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ viewer: null });
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
    } });
  } catch {
    return NextResponse.json({ viewer: null });
  }
}

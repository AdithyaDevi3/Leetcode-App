import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createAccountLifecycleStore } from '@/lib/account-lifecycle-store';

export async function GET() {
  try {
    const session = await requireAuth();
    return NextResponse.json({ requests: await createAccountLifecycleStore().listOwned(session.user.id) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch account requests' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json().catch(() => null) as { type?: unknown; reason?: unknown } | null;
    if (!body || (body.type !== 'export' && body.type !== 'deletion')) return NextResponse.json({ error: 'type must be export or deletion' }, { status: 400 });
    if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 1_000)) return NextResponse.json({ error: 'reason must be at most 1000 characters' }, { status: 400 });
    const lifecycleRequest = await createAccountLifecycleStore().request(session.user.id, body.type, body.reason?.trim() || null);
    return NextResponse.json({ request: lifecycleRequest }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to create account request' }, { status: 500 });
  }
}

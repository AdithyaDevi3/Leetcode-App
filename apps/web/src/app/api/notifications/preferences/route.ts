import { NextResponse } from 'next/server';
import type { NotificationChannel, NotificationPreference } from '@leetcode-app/domain';
import { requireAuth } from '@/lib/auth/session';
import { createNotificationPreferencesStore } from '@/lib/notification-preferences-store';

const channels: NotificationChannel[] = ['in_app', 'email', 'push'];

function validatePreference(value: unknown): NotificationPreference | null {
  if (!value || typeof value !== 'object') return null;
  const preference = value as Record<string, unknown>;
  if (!channels.includes(preference.channel as NotificationChannel) || typeof preference.enabled !== 'boolean') return null;
  const start = preference.quietHoursStart;
  const end = preference.quietHoursEnd;
  if ((start === undefined) !== (end === undefined)) return null;
  if (start !== undefined && (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (start as number) > 23 || (end as number) < 0 || (end as number) > 23)) return null;
  return { channel: preference.channel as NotificationChannel, enabled: preference.enabled, quietHoursStart: start as number | undefined, quietHoursEnd: end as number | undefined };
}

export async function GET() {
  try {
    const session = await requireAuth();
    return NextResponse.json({ preferences: await createNotificationPreferencesStore().listOwned(session.user.id) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to fetch notification preferences' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuth();
    const body = await request.json().catch(() => null) as { preference?: unknown } | null;
    const preference = validatePreference(body?.preference);
    if (!preference) return NextResponse.json({ error: 'preference must include a valid channel, enabled boolean, and optional paired quiet hours from 0 to 23' }, { status: 400 });
    const saved = await createNotificationPreferencesStore().upsertOwned(session.user.id, preference);
    return NextResponse.json({ preference: saved });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized: Authentication required') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    return NextResponse.json({ error: 'Failed to save notification preference' }, { status: 500 });
  }
}

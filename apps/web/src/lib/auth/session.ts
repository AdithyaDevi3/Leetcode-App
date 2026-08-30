import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
export type Session = { user: { id: string; email: string | null; role: 'learner'; displayName: string | null } };

export async function ensureApplicationUser(input: { id: string; email?: string | null; displayName?: string | null }): Promise<void> {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    await db.query(
      `INSERT INTO users (id, email, display_name, role)
       VALUES ($1, $2, $3, 'learner')
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [input.id, input.email ?? null, input.displayName ?? input.email?.split('@')[0] ?? 'Learner'],
    );
  } finally {
    await db.close();
  }
}

/**
 * Guest session cookie name
 */
const GUEST_SESSION_COOKIE = 'leetcode-app.guest-session';

/**
 * Guest session interface
 */
export interface GuestSession {
  id: string;
  sessionToken: string;
  createdAt: Date;
}

type GuestSessionCookie = {
  id: string;
  sessionToken: string;
  createdAt: string;
};

const guestExpiry = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

const parseGuestCookie = (value: string): GuestSessionCookie | null => {
  try {
    const parsed = JSON.parse(value) as Partial<GuestSessionCookie>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.sessionToken !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(new Date(parsed.createdAt).valueOf())
    ) return null;
    return parsed as GuestSessionCookie;
  } catch {
    return null;
  }
};

/**
 * Get the current authenticated session
 * Returns null if user is not authenticated
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  await ensureApplicationUser({ id: user.id, email: user.email, displayName: user.user_metadata.display_name ?? null });
  return { user: { id: user.id, email: user.email ?? null, role: 'learner', displayName: user.user_metadata.display_name ?? null } };
}

/**
 * Require authentication - throws if not authenticated
 * Use this in Server Components or API routes that require auth
 */
export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }
  
  return session;
}

/**
 * Get or create a guest session
 * Guest sessions are stored in HTTP-only cookies and allow
 * unauthenticated users to use the practice workspace
 */
export async function getOrCreateGuestSession(): Promise<GuestSession> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(GUEST_SESSION_COOKIE);
  const parsedCookie = existingCookie ? parseGuestCookie(existingCookie.value) : null;

  if (parsedCookie) {
    const db = createDatabaseClient(databaseConfigFromEnv());
    try {
      const result = await db.query<{ id: string; created_at: Date }>(
        `SELECT id, created_at FROM guest_identities
         WHERE id = $1 AND session_token = $2 AND expires_at > NOW() AND upgraded_to_user_id IS NULL`,
        [parsedCookie.id, parsedCookie.sessionToken],
      );
      if (result.rows[0]) {
        return { id: result.rows[0].id, sessionToken: parsedCookie.sessionToken, createdAt: result.rows[0].created_at };
      }
    } finally {
      await db.close();
    }
  }

  const sessionToken = randomBytes(32).toString('base64url');
  const db = createDatabaseClient(databaseConfigFromEnv());
  let newSession: GuestSession;
  try {
    const created = await db.query<{ id: string; created_at: Date }>(
      `INSERT INTO guest_identities (device_fingerprint, session_token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      ['browser-guest', sessionToken, guestExpiry()],
    );
    newSession = { id: created.rows[0].id, sessionToken, createdAt: created.rows[0].created_at };
  } finally {
    await db.close();
  }

  cookieStore.set(GUEST_SESSION_COOKIE, JSON.stringify({
    id: newSession.id,
    sessionToken: newSession.sessionToken,
    createdAt: newSession.createdAt.toISOString(),
  } satisfies GuestSessionCookie), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  });
  
  return newSession;
}

/**
 * Get the current guest session without creating one
 * Returns null if no guest session exists
 */
export async function getGuestSession(): Promise<GuestSession | null> {
  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(GUEST_SESSION_COOKIE);
  const parsedCookie = existingCookie ? parseGuestCookie(existingCookie.value) : null;
  if (!parsedCookie) return null;

  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const result = await db.query<{ id: string; created_at: Date }>(
      `SELECT id, created_at FROM guest_identities
       WHERE id = $1 AND session_token = $2 AND expires_at > NOW() AND upgraded_to_user_id IS NULL`,
      [parsedCookie.id, parsedCookie.sessionToken],
    );
    const guest = result.rows[0];
    return guest ? { id: guest.id, sessionToken: parsedCookie.sessionToken, createdAt: guest.created_at } : null;
  } finally {
    await db.close();
  }
}

/**
 * Clear the guest session cookie
 * Called after upgrading a guest to a user account
 */
export async function clearGuestSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_SESSION_COOKIE);
}

/**
 * Atomically attaches the current browser guest's durable practice history to a
 * Supabase user. The guest cookie contains an unguessable token and is checked
 * against the database before any ownership change is made.
 */
export async function mergeGuestProgressIntoUser(userId: string): Promise<{ mergedSessions: number }> {
  const guest = await getGuestSession();
  if (!guest) return { mergedSessions: 0 };

  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const mergedSessions = await db.transaction(async (client) => {
      const identity = await client.query<{ id: string }>(
        `SELECT id FROM guest_identities
         WHERE id = $1 AND session_token = $2 AND expires_at > NOW() AND upgraded_to_user_id IS NULL
         FOR UPDATE`,
        [guest.id, guest.sessionToken],
      );
      if (!identity.rows[0]) return 0;
      const moved = await client.query(
        `UPDATE practice_sessions SET user_id = $1, guest_id = NULL
         WHERE guest_id = $2`,
        [userId, guest.id],
      );
      await client.query(
        `UPDATE guest_identities SET upgraded_to_user_id = $1 WHERE id = $2`,
        [userId, guest.id],
      );
      return moved.rowCount ?? 0;
    });
    await clearGuestSession();
    return { mergedSessions };
  } finally {
    await db.close();
  }
}

/**
 * Get the current user ID (authenticated or guest)
 * Returns either the authenticated user ID or guest session ID
 */
export async function getCurrentUserId(): Promise<{ type: 'user' | 'guest'; id: string }> {
  const session = await getSession();
  
  if (session?.user?.id) {
    return { type: 'user', id: session.user.id };
  }
  
  const guestSession = await getOrCreateGuestSession();
  return { type: 'guest', id: guestSession.id };
}

/** Returns the verified durable owner for a practice request. */
export async function getPracticeOwner(): Promise<{ kind: 'user' | 'guest'; id: string }> {
  const session = await getSession();
  if (session) return { kind: 'user', id: session.user.id };
  const guest = await getOrCreateGuestSession();
  return { kind: 'guest', id: guest.id };
}

/**
 * Check if the current request has authentication (user or guest)
 */
export async function hasSession(): Promise<boolean> {
  const session = await getSession();
  if (session?.user?.id) {
    return true;
  }
  
  const guestSession = await getGuestSession();
  return guestSession !== null;
}

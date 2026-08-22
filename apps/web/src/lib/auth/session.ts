import { auth } from './config';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import type { Session } from 'next-auth';

/**
 * Guest session cookie name
 */
const GUEST_SESSION_COOKIE = 'leetcode-app.guest-session';

/**
 * Guest session interface
 */
export interface GuestSession {
  id: string;
  createdAt: Date;
}

/**
 * Get the current authenticated session
 * Returns null if user is not authenticated
 */
export async function getSession(): Promise<Session | null> {
  return await auth();
}

/**
 * Require authentication - throws if not authenticated
 * Use this in Server Components or API routes that require auth
 */
export async function requireAuth(): Promise<Session> {
  const session = await auth();
  
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
  
  if (existingCookie) {
    try {
      const guestSession: GuestSession = JSON.parse(existingCookie.value);
      // Validate the session structure
      if (guestSession.id && guestSession.createdAt) {
        return {
          ...guestSession,
          createdAt: new Date(guestSession.createdAt),
        };
      }
    } catch (error) {
      // Invalid session cookie, create new one
      console.warn('Invalid guest session cookie, creating new session');
    }
  }
  
  // Create new guest session
  const newSession: GuestSession = {
    id: randomUUID(),
    createdAt: new Date(),
  };
  
  cookieStore.set(GUEST_SESSION_COOKIE, JSON.stringify(newSession), {
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
  
  if (!existingCookie) {
    return null;
  }
  
  try {
    const guestSession: GuestSession = JSON.parse(existingCookie.value);
    if (guestSession.id && guestSession.createdAt) {
      return {
        ...guestSession,
        createdAt: new Date(guestSession.createdAt),
      };
    }
  } catch (error) {
    console.warn('Invalid guest session cookie');
  }
  
  return null;
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
 * Get the current user ID (authenticated or guest)
 * Returns either the authenticated user ID or guest session ID
 */
export async function getCurrentUserId(): Promise<{ type: 'user' | 'guest'; id: string }> {
  const session = await auth();
  
  if (session?.user?.id) {
    return { type: 'user', id: session.user.id };
  }
  
  const guestSession = await getOrCreateGuestSession();
  return { type: 'guest', id: guestSession.id };
}

/**
 * Check if the current request has authentication (user or guest)
 */
export async function hasSession(): Promise<boolean> {
  const session = await auth();
  if (session?.user?.id) {
    return true;
  }
  
  const guestSession = await getGuestSession();
  return guestSession !== null;
}

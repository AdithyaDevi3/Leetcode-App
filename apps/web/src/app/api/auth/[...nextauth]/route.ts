import { handlers } from '@/lib/auth/config';

/**
 * NextAuth.js API Route Handler
 * 
 * Handles all authentication requests:
 * - GET /api/auth/signin - Sign in page
 * - POST /api/auth/signin/:provider - Sign in with provider
 * - GET /api/auth/callback/:provider - OAuth callback
 * - POST /api/auth/signout - Sign out
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/csrf - Get CSRF token
 */

export const { GET, POST } = handlers;

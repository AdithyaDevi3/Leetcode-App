import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { type Adapter } from 'next-auth/adapters';
import { createDatabaseClient, databaseConfigFromEnv, type DatabaseClient } from '@leetcode-app/database';
import { createAuthAdapter } from './adapter';

/**
 * Module augmentation for NextAuth types
 * Extends the default session with our custom user properties
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'learner' | 'educator' | 'admin';
      displayName: string | null;
      guestId?: string | null;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    role: 'learner' | 'educator' | 'admin';
    displayName: string | null;
    guestId?: string | null;
  }
}

// Create database client for auth
const dbClient = createDatabaseClient(databaseConfigFromEnv());

/**
 * NextAuth configuration
 * Implements secure authentication with:
 * - Email (passwordless) authentication
 * - OAuth providers (Google, GitHub)
 * - PostgreSQL session storage
 * - Guest upgrade capability
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: createAuthAdapter(dbClient) as Adapter,
  
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      allowDangerousEmailAccountLinking: true, // Required for guest upgrade
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      allowDangerousEmailAccountLinking: true, // Required for guest upgrade
    }),
  ],

  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      // Check if there's a guest session to upgrade
      // This will be handled in the session callback
      return true;
    },

    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
        session.user.displayName = user.displayName;
        session.user.guestId = user.guestId;
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.displayName = user.displayName;
      }
      return token;
    },
  },

  events: {
    async signIn({ user, account, isNewUser }) {
      if (isNewUser) {
        console.log(`New user signed up: ${user.id}`);
        // Future: Send welcome email, initialize user preferences, etc.
      }
    },
    
    async signOut() {
      // Clean up any guest sessions if needed
      console.log(`User signed out`);
    },
  },

  debug: process.env.NODE_ENV === 'development',
});

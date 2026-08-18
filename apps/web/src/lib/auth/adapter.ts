import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from 'next-auth/adapters';
import type { DatabaseClient } from '@leetcode-app/database';
import { PostgresUserRepository, PostgresGuestIdentityRepository } from '@leetcode-app/database';
import { randomUUID } from 'crypto';

/**
 * Custom NextAuth adapter for PostgreSQL using our repository pattern
 * Handles user authentication, session management, and guest upgrade
 */
export function createAuthAdapter(db: DatabaseClient): Adapter {
  const userRepo = new PostgresUserRepository(db);
  const guestRepo = new PostgresGuestIdentityRepository(db);

  return {
    /**
     * Create a new user account
     */
    async createUser(user): Promise<AdapterUser> {
      const newUser = await userRepo.create({
        email: user.email!,
        emailVerified: user.emailVerified ?? null,
        displayName: user.name ?? null,
        role: 'learner',
        preferences: {},
      });

      return {
        id: newUser.id,
        email: newUser.email,
        emailVerified: newUser.emailVerified,
        name: newUser.displayName,
        image: null,
        role: newUser.role,
        displayName: newUser.displayName,
      };
    },

    /**
     * Get user by ID
     */
    async getUser(id): Promise<AdapterUser | null> {
      const user = await userRepo.findById(id);
      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.displayName,
        image: null,
        role: user.role,
        displayName: user.displayName,
      };
    },

    /**
     * Get user by email
     */
    async getUserByEmail(email): Promise<AdapterUser | null> {
      const user = await userRepo.findByEmail(email);
      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.displayName,
        image: null,
        role: user.role,
        displayName: user.displayName,
      };
    },

    /**
     * Get user by account (OAuth provider)
     */
    async getUserByAccount({ providerAccountId, provider }): Promise<AdapterUser | null> {
      const result = await db.query<{ user_id: string }>(
        `SELECT user_id FROM accounts WHERE provider = $1 AND provider_account_id = $2`,
        [provider, providerAccountId]
      );

      if (result.rows.length === 0) return null;
      
      return this.getUser!(result.rows[0].user_id);
    },

    /**
     * Update user information
     */
    async updateUser(user): Promise<AdapterUser> {
      const existingUser = await userRepo.findById(user.id);
      if (!existingUser) {
        throw new Error(`User ${user.id} not found`);
      }

      const updated = await userRepo.update(user.id, existingUser.revision, {
        email: user.email ?? existingUser.email,
        emailVerified: user.emailVerified ?? existingUser.emailVerified,
        displayName: user.name ?? existingUser.displayName,
      });

      return {
        id: updated.id,
        email: updated.email,
        emailVerified: updated.emailVerified,
        name: updated.displayName,
        image: null,
        role: updated.role,
        displayName: updated.displayName,
      };
    },

    /**
     * Delete user (GDPR compliance)
     */
    async deleteUser(userId): Promise<void> {
      const user = await userRepo.findById(userId);
      if (user) {
        await userRepo.delete(userId, user.revision);
      }
    },

    /**
     * Link an account (OAuth) to a user
     */
    async linkAccount(account): Promise<AdapterAccount | null | undefined> {
      await db.query(
        `INSERT INTO accounts (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(),
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          account.session_state ?? null,
        ]
      );

      return account as AdapterAccount;
    },

    /**
     * Unlink an account from a user
     */
    async unlinkAccount({ providerAccountId, provider }): Promise<void> {
      await db.query(
        `DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2`,
        [provider, providerAccountId]
      );
    },

    /**
     * Create a new session
     */
    async createSession({ sessionToken, userId, expires }): Promise<AdapterSession> {
      await db.query(
        `INSERT INTO sessions (id, session_token, user_id, expires, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [randomUUID(), sessionToken, userId, expires]
      );

      return {
        sessionToken,
        userId,
        expires,
      };
    },

    /**
     * Get session and user by session token
     */
    async getSessionAndUser(sessionToken): Promise<{ session: AdapterSession; user: AdapterUser } | null> {
      const result = await db.query<{
        session_token: string;
        user_id: string;
        expires: Date;
        email: string;
        email_verified: Date | null;
        display_name: string | null;
        role: 'learner' | 'educator' | 'admin';
      }>(
        `SELECT s.session_token, s.user_id, s.expires, u.email, u.email_verified, u.display_name, u.role
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.session_token = $1 AND s.expires > NOW()`,
        [sessionToken]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        session: {
          sessionToken: row.session_token,
          userId: row.user_id,
          expires: row.expires,
        },
        user: {
          id: row.user_id,
          email: row.email,
          emailVerified: row.email_verified,
          name: row.display_name,
          image: null,
          role: row.role,
          displayName: row.display_name,
        },
      };
    },

    /**
     * Update session expiration
     */
    async updateSession({ sessionToken, expires, userId }): Promise<AdapterSession | null | undefined> {
      const result = await db.query<{ session_token: string; user_id: string; expires: Date }>(
        `UPDATE sessions SET expires = $1, updated_at = NOW() WHERE session_token = $2 RETURNING session_token, user_id, expires`,
        [expires, sessionToken]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        sessionToken: row.session_token,
        userId: row.user_id,
        expires: row.expires,
      };
    },

    /**
     * Delete a session (logout)
     */
    async deleteSession(sessionToken): Promise<void> {
      await db.query(`DELETE FROM sessions WHERE session_token = $1`, [sessionToken]);
    },

    /**
     * Create a verification token (for email authentication)
     */
    async createVerificationToken({ identifier, expires, token }): Promise<VerificationToken | null | undefined> {
      await db.query(
        `INSERT INTO verification_tokens (identifier, token, expires)
         VALUES ($1, $2, $3)`,
        [identifier, token, expires]
      );

      return {
        identifier,
        token,
        expires,
      };
    },

    /**
     * Use a verification token (one-time use)
     */
    async useVerificationToken({ identifier, token }): Promise<VerificationToken | null> {
      const result = await db.query<{ identifier: string; token: string; expires: Date }>(
        `DELETE FROM verification_tokens WHERE identifier = $1 AND token = $2 RETURNING identifier, token, expires`,
        [identifier, token]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        identifier: row.identifier,
        token: row.token,
        expires: row.expires,
      };
    },
  };
}

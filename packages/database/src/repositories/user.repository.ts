import type { PoolClient } from 'pg';
import { DatabaseClient } from '../client.js';
import { Repository, EntityNotFoundError, OptimisticConcurrencyError, mapDatabaseRow, mapDatabaseRows } from './base.js';

/** Persistence contract for the legacy auth tables defined in the initial migration. */
export type StoredUser = {
  id: string; email: string; emailVerified?: Date | null; displayName: string | null;
  role: 'guest' | 'learner' | 'instructor' | 'educator' | 'admin'; preferences?: Record<string, unknown>;
  createdAt: Date; updatedAt: Date; revision: number;
};

export type StoredUserPreference = {
  userId: string; theme: string; language: string; emailNotifications: boolean; updatedAt: Date;
};

export type StoredGuestIdentity = {
  id: string; deviceFingerprint: string; sessionToken: string; expiresAt: Date;
  upgradedToUserId?: string | null; createdAt: Date;
};

export interface UserRepository extends Repository<StoredUser> {
  findByEmail(email: string, client?: PoolClient): Promise<StoredUser | null>;
  getPreferences(userId: string, client?: PoolClient): Promise<StoredUserPreference | null>;
  updatePreferences(userId: string, preferences: Partial<StoredUserPreference>, client?: PoolClient): Promise<StoredUserPreference>;
}

export interface GuestIdentityRepository extends Repository<StoredGuestIdentity> {
  findBySessionToken(token: string, client?: PoolClient): Promise<StoredGuestIdentity | null>;
  upgradeToUser(guestId: string, userId: string, client?: PoolClient): Promise<void>;
}

export class PostgresUserRepository implements UserRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string, client?: PoolClient): Promise<StoredUser | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredUser>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] ? mapDatabaseRow<StoredUser>(result.rows[0]) : null;
  }

  async findByEmail(email: string, client?: PoolClient): Promise<StoredUser | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredUser>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] ? mapDatabaseRow<StoredUser>(result.rows[0]) : null;
  }

  async findAll(client?: PoolClient): Promise<StoredUser[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredUser>('SELECT * FROM users ORDER BY created_at DESC');
    return mapDatabaseRows<StoredUser>(result.rows);
  }

  async create(user: Omit<StoredUser, 'id' | 'createdAt' | 'updatedAt'>, client?: PoolClient): Promise<StoredUser> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredUser>(
      `INSERT INTO users (email, display_name, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [user.email, user.displayName, user.role]
    );
    return mapDatabaseRow<StoredUser>(result.rows[0]);
  }

  async update(id: string, user: Partial<StoredUser>, revision: number, client?: PoolClient): Promise<StoredUser> {
    const executor = client || this.db.getPool();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (user.email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(user.email);
    }
    if (user.displayName !== undefined) {
      updates.push(`display_name = $${paramCount++}`);
      values.push(user.displayName);
    }
    if (user.role !== undefined) {
      updates.push(`role = $${paramCount++}`);
      values.push(user.role);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, client);
      if (!existing) throw new EntityNotFoundError('User', id);
      return existing;
    }

    updates.push(`revision = revision + 1`);
    values.push(id, revision);

    const result = await executor.query<StoredUser>(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND revision = $${paramCount++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new OptimisticConcurrencyError('User was modified by another transaction');
    }

    return mapDatabaseRow<StoredUser>(result.rows[0]);
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db.getPool();
    await executor.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async getPreferences(userId: string, client?: PoolClient): Promise<StoredUserPreference | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredUserPreference>(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] ? mapDatabaseRow<StoredUserPreference>(result.rows[0]) : null;
  }

  async updatePreferences(userId: string, preferences: Partial<StoredUserPreference>, client?: PoolClient): Promise<StoredUserPreference> {
    const executor = client || this.db.getPool();
    
    const result = await executor.query<StoredUserPreference>(
      `INSERT INTO user_preferences (user_id, theme, language, email_notifications)
       VALUES ($1, COALESCE($2, 'light'), COALESCE($3, 'en'), COALESCE($4, true))
       ON CONFLICT (user_id) DO UPDATE
       SET theme = COALESCE($2, user_preferences.theme),
           language = COALESCE($3, user_preferences.language),
           email_notifications = COALESCE($4, user_preferences.email_notifications),
           updated_at = NOW()
       RETURNING *`,
      [userId, preferences.theme, preferences.language, preferences.emailNotifications]
    );

    return mapDatabaseRow<StoredUserPreference>(result.rows[0]);
  }
}

export class PostgresGuestIdentityRepository implements GuestIdentityRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string, client?: PoolClient): Promise<StoredGuestIdentity | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredGuestIdentity>(
      'SELECT * FROM guest_identities WHERE id = $1',
      [id]
    );
    return result.rows[0] ? mapDatabaseRow<StoredGuestIdentity>(result.rows[0]) : null;
  }

  async findBySessionToken(token: string, client?: PoolClient): Promise<StoredGuestIdentity | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredGuestIdentity>(
      'SELECT * FROM guest_identities WHERE session_token = $1',
      [token]
    );
    return result.rows[0] ? mapDatabaseRow<StoredGuestIdentity>(result.rows[0]) : null;
  }

  async findAll(client?: PoolClient): Promise<StoredGuestIdentity[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredGuestIdentity>(
      'SELECT * FROM guest_identities ORDER BY created_at DESC'
    );
    return mapDatabaseRows<StoredGuestIdentity>(result.rows);
  }

  async create(guest: Omit<StoredGuestIdentity, 'id' | 'createdAt'>, client?: PoolClient): Promise<StoredGuestIdentity> {
    const executor = client || this.db.getPool();
    const result = await executor.query<StoredGuestIdentity>(
      `INSERT INTO guest_identities (device_fingerprint, session_token, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [guest.deviceFingerprint, guest.sessionToken, guest.expiresAt]
    );
    return mapDatabaseRow<StoredGuestIdentity>(result.rows[0]);
  }

  async update(id: string, guest: Partial<StoredGuestIdentity>, _revision: number, client?: PoolClient): Promise<StoredGuestIdentity> {
    const executor = client || this.db.getPool();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (guest.expiresAt !== undefined) {
      updates.push(`expires_at = $${paramCount++}`);
      values.push(guest.expiresAt);
    }
    if (guest.upgradedToUserId !== undefined) {
      updates.push(`upgraded_to_user_id = $${paramCount++}`);
      values.push(guest.upgradedToUserId);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, client);
      if (!existing) throw new EntityNotFoundError('GuestIdentity', id);
      return existing;
    }

    values.push(id);

    const result = await executor.query<StoredGuestIdentity>(
      `UPDATE guest_identities
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new EntityNotFoundError('GuestIdentity', id);
    }

    return mapDatabaseRow<StoredGuestIdentity>(result.rows[0]);
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db.getPool();
    await executor.query('DELETE FROM guest_identities WHERE id = $1', [id]);
  }

  async upgradeToUser(guestId: string, userId: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db.getPool();
    await executor.query(
      'UPDATE guest_identities SET upgraded_to_user_id = $1 WHERE id = $2',
      [userId, guestId]
    );
  }
}

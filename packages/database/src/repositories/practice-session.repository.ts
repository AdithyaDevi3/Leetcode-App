import type { PoolClient } from 'pg';
import type { PracticeSession, Attempt, PseudocodeRevision } from '@leetcode-app/domain';
import { DatabaseClient } from '../client.js';
import { Repository, EntityNotFoundError, OptimisticConcurrencyError } from './base.js';

export interface PracticeSessionRepository extends Repository<PracticeSession> {
  findByUser(userId: string, client?: PoolClient): Promise<PracticeSession[]>;
  findByGuest(guestId: string, client?: PoolClient): Promise<PracticeSession[]>;
  findByContent(contentId: string, client?: PoolClient): Promise<PracticeSession[]>;
  getAttempts(sessionId: string, client?: PoolClient): Promise<Attempt[]>;
  createAttempt(sessionId: string, attempt: Attempt, client?: PoolClient): Promise<Attempt>;
  getPseudocodeRevisions(sessionId: string, client?: PoolClient): Promise<PseudocodeRevision[]>;
  createPseudocodeRevision(sessionId: string, revision: PseudocodeRevision, client?: PoolClient): Promise<PseudocodeRevision>;
}

export class PostgresPracticeSessionRepository implements PracticeSessionRepository {
  constructor(private db: DatabaseClient) {}

  async findById(id: string, client?: PoolClient): Promise<PracticeSession | null> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PracticeSession>(
      'SELECT * FROM practice_sessions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async findByUser(userId: string, client?: PoolClient): Promise<PracticeSession[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PracticeSession>(
      'SELECT * FROM practice_sessions WHERE user_id = $1 ORDER BY started_at DESC',
      [userId]
    );
    return result.rows;
  }

  async findByGuest(guestId: string, client?: PoolClient): Promise<PracticeSession[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PracticeSession>(
      'SELECT * FROM practice_sessions WHERE guest_id = $1 ORDER BY started_at DESC',
      [guestId]
    );
    return result.rows;
  }

  async findByContent(contentId: string, client?: PoolClient): Promise<PracticeSession[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PracticeSession>(
      'SELECT * FROM practice_sessions WHERE content_id = $1 ORDER BY started_at DESC',
      [contentId]
    );
    return result.rows;
  }

  async findAll(client?: PoolClient): Promise<PracticeSession[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PracticeSession>(
      'SELECT * FROM practice_sessions ORDER BY started_at DESC'
    );
    return result.rows;
  }

  async create(session: Omit<PracticeSession, 'id' | 'startedAt'>, client?: PoolClient): Promise<PracticeSession> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PracticeSession>(
      `INSERT INTO practice_sessions 
       (user_id, guest_id, content_id, content_version, status, completed_at, total_time_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        session.userId,
        session.guestId,
        session.contentId,
        session.contentVersion,
        session.status,
        session.completedAt,
        session.totalTimeSeconds,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, session: Partial<PracticeSession>, revision: number, client?: PoolClient): Promise<PracticeSession> {
    const executor = client || this.db.getPool();
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (session.status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(session.status);
    }
    if (session.completedAt !== undefined) {
      updates.push(`completed_at = $${paramCount++}`);
      values.push(session.completedAt);
    }
    if (session.totalTimeSeconds !== undefined) {
      updates.push(`total_time_seconds = $${paramCount++}`);
      values.push(session.totalTimeSeconds);
    }

    if (updates.length === 0) {
      const existing = await this.findById(id, client);
      if (!existing) throw new EntityNotFoundError('PracticeSession', id);
      return existing;
    }

    updates.push(`revision = revision + 1`);
    values.push(id, revision);

    const result = await executor.query<PracticeSession>(
      `UPDATE practice_sessions
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND revision = $${paramCount++}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new OptimisticConcurrencyError('PracticeSession was modified by another transaction');
    }

    return result.rows[0];
  }

  async delete(id: string, client?: PoolClient): Promise<void> {
    const executor = client || this.db.getPool();
    await executor.query('DELETE FROM practice_sessions WHERE id = $1', [id]);
  }

  async getAttempts(sessionId: string, client?: PoolClient): Promise<Attempt[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<Attempt>(
      'SELECT * FROM attempts WHERE session_id = $1 ORDER BY attempt_number ASC',
      [sessionId]
    );
    return result.rows;
  }

  async createAttempt(sessionId: string, attempt: Attempt, client?: PoolClient): Promise<Attempt> {
    const executor = client || this.db.getPool();
    const result = await executor.query<Attempt>(
      `INSERT INTO attempts (session_id, attempt_number, submitted_code, submitted_pseudocode)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [sessionId, attempt.attemptNumber, attempt.submittedCode, attempt.submittedPseudocode]
    );
    return result.rows[0];
  }

  async getPseudocodeRevisions(sessionId: string, client?: PoolClient): Promise<PseudocodeRevision[]> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PseudocodeRevision>(
      'SELECT * FROM pseudocode_revisions WHERE session_id = $1 ORDER BY revision_number ASC',
      [sessionId]
    );
    return result.rows;
  }

  async createPseudocodeRevision(sessionId: string, revision: PseudocodeRevision, client?: PoolClient): Promise<PseudocodeRevision> {
    const executor = client || this.db.getPool();
    const result = await executor.query<PseudocodeRevision>(
      `INSERT INTO pseudocode_revisions (session_id, revision_number, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [sessionId, revision.revisionNumber, revision.content]
    );
    return result.rows[0];
  }
}

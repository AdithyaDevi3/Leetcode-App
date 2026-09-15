import type { AdministrationRole } from '@leetcode-app/domain';
import type { QueryResult, QueryResultRow } from 'pg';
import type { DatabaseClient } from '../client.js';

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>>;
};

export type AdministrationOverview = {
  users: number;
  usersThisWeek: number;
  activePracticeSessions: number;
  openFeedback: number;
  pendingAppeals: number;
  queuedEvaluations: number;
  queuedExecutions: number;
  pendingPrivacyRequests: number;
};

export type AdministrationUser = {
  id: string;
  email: string | null;
  displayName: string;
  createdAt: string;
  roles: AdministrationRole[];
};

export type AdministrationFeedback = {
  id: string;
  type: 'question' | 'feature';
  title: string;
  status: 'submitted' | 'triaged' | 'accepted' | 'rejected' | 'completed';
  submittedBy: string;
  createdAt: string;
};

export type AdministrationAppeal = {
  id: string;
  findingId: string;
  status: 'submitted' | 'in_review' | 'resolved';
  submittedBy: string;
  createdAt: string;
};

export type AdministrationContentItem = {
  id: string;
  slug: string;
  type: 'lesson' | 'problem' | 'module';
  status: 'draft' | 'published' | 'archived';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  title: string;
  version: number | null;
  updatedAt: string;
};

export type AdministrationPrivacyRequest = {
  id: string;
  type: 'export' | 'deletion';
  status: 'requested' | 'processing' | 'completed' | 'rejected';
  submittedBy: string;
  requestedAt: string;
};

export type AdministrationAuditEvent = {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdministrationOperations = {
  evaluations: Record<string, number>;
  executions: Record<string, number>;
  oldestEvaluationQueuedAt: string | null;
  oldestExecutionQueuedAt: string | null;
};

const iso = (value: Date | string): string => new Date(value).toISOString();

export class LastAdministratorError extends Error {
  constructor() {
    super('The final administrator role cannot be removed.');
    this.name = 'LastAdministratorError';
  }
}

export class AdministratorAlreadyExistsError extends Error {
  constructor() {
    super('An administrator already exists; use the portal to manage roles.');
    this.name = 'AdministratorAlreadyExistsError';
  }
}

export class AdministrationUserNotFoundError extends Error {
  constructor() {
    super('No confirmed Supabase Auth user matches that email.');
    this.name = 'AdministrationUserNotFoundError';
  }
}

export class PostgresAdministrationRepository {
  constructor(private readonly db: DatabaseClient) {}

  async listActiveRoles(userId: string, queryable: Queryable = this.db): Promise<AdministrationRole[]> {
    const result = await queryable.query<{ role: AdministrationRole }>(
      `SELECT role FROM administration_role_assignments
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY role`,
      [userId],
    );
    return result.rows.map((row) => row.role);
  }

  async getOverview(queryable: Queryable = this.db): Promise<AdministrationOverview> {
    const result = await queryable.query<Record<keyof AdministrationOverview, string>>(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS "usersThisWeek",
        (SELECT COUNT(*) FROM practice_sessions WHERE status = 'active') AS "activePracticeSessions",
        (SELECT COUNT(*) FROM learner_requests WHERE status IN ('submitted', 'triaged', 'accepted')) AS "openFeedback",
        (SELECT COUNT(*) FROM evaluation_appeals WHERE status <> 'resolved') AS "pendingAppeals",
        (SELECT COUNT(*) FROM evaluation_jobs WHERE status = 'queued') AS "queuedEvaluations",
        (SELECT COUNT(*) FROM execution_jobs WHERE status = 'queued') AS "queuedExecutions",
        (SELECT COUNT(*) FROM account_lifecycle_requests WHERE status IN ('requested', 'processing')) AS "pendingPrivacyRequests"
    `);
    const row = result.rows[0];
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as AdministrationOverview;
  }

  async listUsers(limit = 50, queryable: Queryable = this.db): Promise<AdministrationUser[]> {
    const result = await queryable.query<{
      id: string; email: string | null; display_name: string; created_at: Date | string; roles: AdministrationRole[];
    }>(`
      SELECT u.id, u.email, u.display_name, u.created_at,
        COALESCE(
          ARRAY_AGG(ara.role ORDER BY ara.role) FILTER (WHERE ara.id IS NOT NULL),
          ARRAY[]::administration_role[]
        ) AS roles
      FROM users u
      LEFT JOIN administration_role_assignments ara ON ara.user_id = u.id AND ara.revoked_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 100))]);
    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: iso(row.created_at),
      roles: row.roles,
    }));
  }

  async listFeedback(limit = 50, queryable: Queryable = this.db): Promise<AdministrationFeedback[]> {
    const result = await queryable.query<{
      id: string; type: AdministrationFeedback['type']; title: string; status: AdministrationFeedback['status']; submitted_by: string; created_at: Date | string;
    }>(`
      SELECT lr.id, lr.type, lr.title, lr.status,
        COALESCE(u.display_name, 'Guest learner') AS submitted_by,
        lr.created_at
      FROM learner_requests lr
      LEFT JOIN users u ON u.id = lr.user_id
      ORDER BY lr.created_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 100))]);
    return result.rows.map((row) => ({ id: row.id, type: row.type, title: row.title, status: row.status, submittedBy: row.submitted_by, createdAt: iso(row.created_at) }));
  }

  async listAppeals(limit = 50, queryable: Queryable = this.db): Promise<AdministrationAppeal[]> {
    const result = await queryable.query<{
      id: string; finding_id: string; status: AdministrationAppeal['status']; submitted_by: string; created_at: Date | string;
    }>(`
      SELECT ea.id, ea.finding_id, ea.status, u.display_name AS submitted_by, ea.created_at
      FROM evaluation_appeals ea
      JOIN users u ON u.id = ea.user_id
      ORDER BY ea.created_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 100))]);
    return result.rows.map((row) => ({ id: row.id, findingId: row.finding_id, status: row.status, submittedBy: row.submitted_by, createdAt: iso(row.created_at) }));
  }

  async listContent(limit = 50, queryable: Queryable = this.db): Promise<AdministrationContentItem[]> {
    const result = await queryable.query<{
      id: string; slug: string; type: AdministrationContentItem['type']; status: AdministrationContentItem['status']; difficulty: AdministrationContentItem['difficulty']; title: string | null; version: number | null; updated_at: Date | string;
    }>(`
      SELECT ci.id, ci.slug, ci.type, ci.status, ci.difficulty, ci.updated_at,
        latest.title, latest.version
      FROM content_items ci
      LEFT JOIN LATERAL (
        SELECT cv.title, cv.version
        FROM content_versions cv
        WHERE cv.content_id = ci.id
        ORDER BY cv.version DESC
        LIMIT 1
      ) latest ON true
      ORDER BY ci.updated_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 100))]);
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      type: row.type,
      status: row.status,
      difficulty: row.difficulty,
      title: row.title ?? row.slug,
      version: row.version,
      updatedAt: iso(row.updated_at),
    }));
  }

  async listPrivacyRequests(limit = 50, queryable: Queryable = this.db): Promise<AdministrationPrivacyRequest[]> {
    const result = await queryable.query<{
      id: string; type: AdministrationPrivacyRequest['type']; status: AdministrationPrivacyRequest['status']; submitted_by: string; requested_at: Date | string;
    }>(`
      SELECT alr.id, alr.type, alr.status, u.display_name AS submitted_by, alr.requested_at
      FROM account_lifecycle_requests alr
      JOIN users u ON u.id = alr.user_id
      ORDER BY alr.requested_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 100))]);
    return result.rows.map((row) => ({ id: row.id, type: row.type, status: row.status, submittedBy: row.submitted_by, requestedAt: iso(row.requested_at) }));
  }

  async getOperations(queryable: Queryable = this.db): Promise<AdministrationOperations> {
    const [evaluationResult, executionResult] = await Promise.all([
      queryable.query<{ status: string; count: string; oldest_queued_at: Date | string | null }>(`
        SELECT status, COUNT(*) AS count,
          MIN(queued_at) FILTER (WHERE status = 'queued') AS oldest_queued_at
        FROM evaluation_jobs GROUP BY status ORDER BY status
      `),
      queryable.query<{ status: string; count: string; oldest_queued_at: Date | string | null }>(`
        SELECT status, COUNT(*) AS count,
          MIN(queued_at) FILTER (WHERE status = 'queued') AS oldest_queued_at
        FROM execution_jobs GROUP BY status ORDER BY status
      `),
    ]);
    const toCounts = (rows: Array<{ status: string; count: string }>) => Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
    const oldest = (rows: Array<{ oldest_queued_at: Date | string | null }>) => rows.find((row) => row.oldest_queued_at)?.oldest_queued_at ?? null;
    const oldestEvaluation = oldest(evaluationResult.rows);
    const oldestExecution = oldest(executionResult.rows);
    return {
      evaluations: toCounts(evaluationResult.rows),
      executions: toCounts(executionResult.rows),
      oldestEvaluationQueuedAt: oldestEvaluation ? iso(oldestEvaluation) : null,
      oldestExecutionQueuedAt: oldestExecution ? iso(oldestExecution) : null,
    };
  }

  async listAuditEvents(limit = 100, queryable: Queryable = this.db): Promise<AdministrationAuditEvent[]> {
    const result = await queryable.query<{
      id: string; actor: string; action: string; target_type: string; target_id: string; reason: string; request_id: string | null; metadata: Record<string, unknown>; created_at: Date | string;
    }>(`
      SELECT aae.id, u.display_name AS actor, aae.action, aae.target_type,
        aae.target_id, aae.reason, aae.request_id, aae.metadata, aae.created_at
      FROM administration_audit_events aae
      JOIN users u ON u.id = aae.actor_id
      ORDER BY aae.created_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(limit, 200))]);
    return result.rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      reason: row.reason,
      requestId: row.request_id,
      metadata: row.metadata,
      createdAt: iso(row.created_at),
    }));
  }

  async replaceRoles(input: {
    actorId: string;
    targetUserId: string;
    roles: AdministrationRole[];
    reason: string;
    requestId?: string | null;
  }): Promise<AdministrationRole[]> {
    return this.db.transaction(async (client) => {
      await client.query('LOCK TABLE administration_role_assignments IN SHARE ROW EXCLUSIVE MODE');
      await client.query('SELECT id FROM users WHERE id IN ($1, $2) FOR UPDATE', [input.actorId, input.targetUserId]);
      const before = await this.listActiveRoles(input.targetUserId, client);
      const removingAdministrator = before.includes('administrator') && !input.roles.includes('administrator');
      if (removingAdministrator) {
        const remaining = await client.query<{ count: string }>(`
          SELECT COUNT(DISTINCT user_id) AS count
          FROM administration_role_assignments
          WHERE role = 'administrator' AND revoked_at IS NULL AND user_id <> $1
        `, [input.targetUserId]);
        if (Number(remaining.rows[0].count) === 0) throw new LastAdministratorError();
      }

      await client.query(`
        UPDATE administration_role_assignments
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL AND NOT (role = ANY($2::administration_role[]))
      `, [input.targetUserId, input.roles]);

      for (const role of input.roles) {
        await client.query(`
          INSERT INTO administration_role_assignments (user_id, role, assigned_by)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, role) WHERE revoked_at IS NULL DO NOTHING
        `, [input.targetUserId, role, input.actorId]);
      }

      const after = await this.listActiveRoles(input.targetUserId, client);
      await client.query(`
        INSERT INTO administration_audit_events
          (actor_id, action, target_type, target_id, reason, request_id, metadata)
        VALUES ($1, 'administration.roles.update', 'user', $2, $3, $4, $5::jsonb)
      `, [input.actorId, input.targetUserId, input.reason, input.requestId ?? null, JSON.stringify({ before, after })]);
      return after;
    });
  }

  /** One-time operational bootstrap. Refuses to run after any administrator exists. */
  async bootstrapFirstAdministrator(input: { email: string; reason: string }): Promise<{ userId: string }> {
    return this.db.transaction(async (client) => {
      await client.query('LOCK TABLE administration_role_assignments IN SHARE ROW EXCLUSIVE MODE');
      const existing = await client.query<{ count: string }>(`
        SELECT COUNT(*) AS count FROM administration_role_assignments
        WHERE role = 'administrator' AND revoked_at IS NULL
      `);
      if (Number(existing.rows[0].count) > 0) throw new AdministratorAlreadyExistsError();

      const authUser = await client.query<{
        id: string;
        email: string;
        display_name: string | null;
      }>(`
        SELECT id, email, raw_user_meta_data ->> 'display_name' AS display_name
        FROM auth.users
        WHERE lower(email) = lower($1) AND email_confirmed_at IS NOT NULL
        LIMIT 1
      `, [input.email]);
      const user = authUser.rows[0];
      if (!user) throw new AdministrationUserNotFoundError();

      await client.query(`
        INSERT INTO users (id, email, display_name, role)
        VALUES ($1, $2, $3, 'admin')
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = 'admin'
      `, [user.id, user.email, user.display_name?.trim() || user.email.split('@')[0] || 'Administrator']);
      await client.query(`
        INSERT INTO administration_role_assignments (user_id, role, assigned_by)
        VALUES ($1, 'administrator', $1)
      `, [user.id]);
      await client.query(`
        INSERT INTO administration_audit_events
          (actor_id, action, target_type, target_id, reason, metadata)
        VALUES ($1, 'administration.bootstrap', 'user', $1, $2, $3::jsonb)
      `, [user.id, input.reason, JSON.stringify({ after: ['administrator'] })]);
      return { userId: user.id };
    });
  }
}

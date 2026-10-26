import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import { evaluatePseudocode } from './evaluator';
import { toPersistedContentId } from './content-id';
import { fromPersistedContentId } from './content-id';
import type { PracticeSessionState } from './practice-session';
import { getPracticeItem } from './content';
import { createReviewStore } from './review-store';
import { restoreVerifiedWorkspace } from './practice-verification-state';
import { createHash } from 'node:crypto';
import { PracticeRevisionConflict } from './practice-sync-contract';

type PracticeSessionRecord = {
  id: string;
  user_id: string | null;
  guest_id: string | null;
  content_id: string;
  current_stage: 'understand' | 'match' | 'plan' | 'implement' | 'evaluate';
  status: 'not_started' | 'in_progress' | 'completed';
  session_metadata: Record<string, unknown>;
  revision: number;
  created_at: Date;
  updated_at: Date;
  latest_revision_number?: number | null;
};

export type StartOrResumePracticeSessionInput = {
  owner: PracticeOwner;
  contentId: string;
};

export type PracticeOwner = { kind: 'user' | 'guest'; id: string };

export type StartOrResumePracticeSessionResult = {
  session: PracticeSessionSummary;
  created: boolean;
};

export type PracticeSessionSummary = {
  id: string;
  contentId: string;
  currentStage: PracticeSessionRecord['current_stage'];
  status: PracticeSessionRecord['status'];
  revision: number;
  latestRevisionNumber: number | null;
  createdAt: string;
  updatedAt: string;
  sessionMetadata: Record<string, unknown>;
};

export type AppendPracticeRevisionInput = {
  owner: PracticeOwner;
  sessionId: string;
  draft: string;
  currentStage?: PracticeSessionRecord['current_stage'];
  workspaceState?: PracticeSessionState;
  expectedRevisionNumber?: number;
  requestKey?: string;
};

export type AppendPracticeRevisionResult = {
  revision: {
    sessionId: string;
    revisionNumber: number;
    sessionRevision: number;
    draft: string;
    currentStage: PracticeSessionRecord['current_stage'];
    status: PracticeSessionRecord['status'];
    updatedAt: string;
  };
};

export type PracticeRevisionEntry = {
  id: string;
  revisionNumber: number;
  content: string;
  createdAt: string;
};

export type PracticeHistoryItem = {
  session: PracticeSessionSummary;
  revisionCount: number;
  latestRevision: Pick<PracticeRevisionEntry, 'id' | 'revisionNumber' | 'createdAt'> | null;
  evaluation: {
    status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
    approved: boolean | null;
    score: number | null;
    summary: string | null;
    completedAt: string | null;
  } | null;
};

type EvaluationHistoryStatus = NonNullable<PracticeHistoryItem['evaluation']>['status'];

export type EvaluatePracticeRevisionResult = {
  evaluation: {
    sessionId: string;
    revisionNumber: number;
    approved: boolean;
    score: number;
    summary: string;
    findings: ReturnType<typeof evaluatePseudocode>['findings'];
  };
};

export type CompletePracticeSessionResult = {
  session: PracticeSessionSummary;
};

const mapPracticeSession = (session: PracticeSessionRecord): PracticeSessionSummary => ({
  id: session.id,
  contentId: fromPersistedContentId(session.content_id),
  currentStage: session.current_stage,
  status: session.status,
  revision: session.revision,
  latestRevisionNumber: session.latest_revision_number ?? null,
  createdAt: session.created_at.toISOString(),
  updatedAt: session.updated_at.toISOString(),
  sessionMetadata: session.session_metadata.verification ? {
    ...session.session_metadata,
    workspaceState: restoreVerifiedWorkspace(session.session_metadata, fromPersistedContentId(session.content_id)),
  } : session.session_metadata,
});

const ownerColumn = (owner: PracticeOwner) => owner.kind === 'user' ? 'user_id' : 'guest_id';

export function createPracticeDatabaseClient() {
  return createDatabaseClient(databaseConfigFromEnv());
}

export async function startOrResumePracticeSession(
  input: StartOrResumePracticeSessionInput,
): Promise<StartOrResumePracticeSessionResult> {
  const db = createPracticeDatabaseClient();
  const persistedContentId = toPersistedContentId(input.contentId);

  try {
    return await db.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`practice-session:${input.owner.kind}:${input.owner.id}:${persistedContentId}`]);
      const existing = await client.query<PracticeSessionRecord>(
        `SELECT s.id, s.user_id, s.guest_id, s.content_id, s.current_stage, s.status, s.session_metadata, s.revision, s.created_at, s.updated_at,
                (SELECT MAX(r.revision_number) FROM pseudocode_revisions r WHERE r.session_id = s.id) AS latest_revision_number
         FROM practice_sessions s
         WHERE ${ownerColumn(input.owner)} = $1 AND content_id = $2
         ORDER BY s.updated_at DESC
         LIMIT 1`,
        [input.owner.id, persistedContentId],
      );

      if (existing.rows.length > 0) {
        return {
          created: false,
          session: mapPracticeSession(existing.rows[0]),
        };
      }

      const created = await client.query<PracticeSessionRecord>(
        `INSERT INTO practice_sessions (
           user_id, guest_id,
           content_version,
           content_id,
           current_stage,
           status,
           session_metadata,
           revision
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at, NULL::integer AS latest_revision_number`,
        [input.owner.kind === 'user' ? input.owner.id : null, input.owner.kind === 'guest' ? input.owner.id : null, 1, persistedContentId, 'understand', 'not_started', {}, 1],
      );

      return {
        created: true,
        session: mapPracticeSession(created.rows[0]),
      };
    });
  } finally {
    await db.close();
  }
}

export async function appendPracticeRevision(
  input: AppendPracticeRevisionInput,
): Promise<AppendPracticeRevisionResult> {
  const db = createPracticeDatabaseClient();

  try {
    return await db.transaction(async (client) => {
      const sessionResult = await client.query<PracticeSessionRecord>(
        `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
         FROM practice_sessions
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $2
         FOR UPDATE`,
        [input.sessionId, input.owner.id],
      );

      if (sessionResult.rows.length === 0) {
        throw new Error('Practice session not found');
      }

      const session = sessionResult.rows[0];
      const nextRevisionNumberResult = await client.query<{ next_revision_number: string }>(
        `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision_number
         FROM pseudocode_revisions
         WHERE session_id = $1`,
        [session.id],
      );

      const nextRevisionNumber = Number(nextRevisionNumberResult.rows[0]?.next_revision_number ?? 1);
      const normalizedDraft = input.draft.trim();
      const stage = input.currentStage ?? session.current_stage;
      type Receipt = { requestKey: string; fingerprint: string; result: AppendPracticeRevisionResult };
      const receipts = (session.session_metadata.saveReceipts ?? []) as Receipt[];
      const fingerprint = createHash('sha256').update(JSON.stringify({
        draft: normalizedDraft, currentStage: input.currentStage ?? null,
        workspaceState: input.workspaceState ?? null, expectedRevisionNumber: input.expectedRevisionNumber ?? null,
      }, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)).digest('hex');
      const previous = input.requestKey ? receipts.find(receipt => receipt.requestKey === input.requestKey) : null;
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new PracticeRevisionConflict(nextRevisionNumber - 1, 'request_reused');
        return previous.result;
      }
      if (input.expectedRevisionNumber !== undefined && input.expectedRevisionNumber !== nextRevisionNumber - 1) {
        throw new PracticeRevisionConflict(nextRevisionNumber - 1);
      }
      const result: AppendPracticeRevisionResult = {
        revision: {
          sessionId: session.id, revisionNumber: nextRevisionNumber, sessionRevision: session.revision + 1,
          draft: normalizedDraft, currentStage: stage,
          status: session.status === 'not_started' ? 'in_progress' : session.status,
          updatedAt: new Date().toISOString(),
        },
      };
      const metadata = { ...session.session_metadata, draft: normalizedDraft, currentStage: stage,
        ...(input.workspaceState ? { workspaceState: input.workspaceState } : {}),
        ...(input.requestKey ? { saveReceipts: [...receipts, { requestKey: input.requestKey, fingerprint, result }].slice(-64) } : {}),
      };
      await client.query(
        `UPDATE practice_sessions
         SET session_metadata = $2::jsonb,
             current_stage = $3,
             status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $4`,
        [session.id, JSON.stringify(metadata), stage, input.owner.id],
      );

      await client.query(
        `INSERT INTO pseudocode_revisions (session_id, revision_number, content)
         VALUES ($1, $2, $3)`,
        [session.id, nextRevisionNumber, normalizedDraft],
      );

      return result;
    });
  } finally {
    await db.close();
  }
}

export async function getPracticeSessionHistory(input: {
  owner: PracticeOwner;
  sessionId: string;
}): Promise<{ session: PracticeSessionSummary; revisions: PracticeRevisionEntry[] }> {
  const db = createPracticeDatabaseClient();

  try {
    const sessionResult = await db.query<PracticeSessionRecord>(
      `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
       FROM practice_sessions
       WHERE id = $1 AND ${ownerColumn(input.owner)} = $2
       LIMIT 1`,
      [input.sessionId, input.owner.id],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Practice session not found');
    }

    const revisionResult = await db.query<{
      id: string;
      revision_number: number;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, revision_number, content, created_at
       FROM pseudocode_revisions
       WHERE session_id = $1
       ORDER BY revision_number ASC`,
      [input.sessionId],
    );

    return {
      session: mapPracticeSession(sessionResult.rows[0]),
      revisions: revisionResult.rows.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revision_number,
        content: revision.content,
        createdAt: revision.created_at.toISOString(),
      })),
    };
  } finally {
    await db.close();
  }
}

type PracticeHistoryRow = PracticeSessionRecord & {
  revision_count: string | number;
  latest_revision_id: string | null;
  latest_revision_number: number | null;
  latest_revision_created_at: Date | string | null;
  evaluation_status: EvaluationHistoryStatus | null;
  evaluation_result: unknown;
  evaluation_completed_at: Date | string | null;
};

const evaluationSummary = (row: Pick<PracticeHistoryRow, 'evaluation_status' | 'evaluation_result' | 'evaluation_completed_at'>): PracticeHistoryItem['evaluation'] => {
  if (!row.evaluation_status) return null;
  const result = row.evaluation_result;
  const evaluation = result && typeof result === 'object' && 'evaluation' in result
    ? (result as { evaluation?: unknown }).evaluation
    : null;
  const details = evaluation && typeof evaluation === 'object' ? evaluation as Record<string, unknown> : {};
  return {
    status: row.evaluation_status,
    approved: typeof details.approved === 'boolean' ? details.approved : null,
    score: typeof details.score === 'number' ? details.score : null,
    summary: typeof details.summary === 'string' ? details.summary : null,
    completedAt: iso(row.evaluation_completed_at),
  };
};

const iso = (value: Date | string | null): string | null => value === null ? null : new Date(value).toISOString();

/**
 * Returns only the authenticated learner's session metadata and aggregate history.
 * Draft contents stay behind the existing owner-scoped per-session history endpoint.
 */
export async function listPracticeHistory(userId: string): Promise<PracticeHistoryItem[]> {
  const db = createPracticeDatabaseClient();

  try {
    const result = await db.query<PracticeHistoryRow>(
      `SELECT s.id, s.user_id, s.guest_id, s.content_id, s.current_stage, s.status, s.session_metadata, s.revision, s.created_at, s.updated_at,
              COUNT(r.id)::integer AS revision_count,
              latest_revision.id AS latest_revision_id,
              latest_revision.revision_number AS latest_revision_number,
              latest_revision.created_at AS latest_revision_created_at,
              latest_evaluation.status AS evaluation_status,
              latest_evaluation.result AS evaluation_result,
              latest_evaluation.completed_at AS evaluation_completed_at
       FROM practice_sessions s
       LEFT JOIN pseudocode_revisions r ON r.session_id = s.id
       LEFT JOIN LATERAL (
         SELECT id, revision_number, created_at
         FROM pseudocode_revisions
         WHERE session_id = s.id
         ORDER BY revision_number DESC
         LIMIT 1
       ) latest_revision ON true
       LEFT JOIN LATERAL (
         SELECT status, result, completed_at
         FROM evaluation_jobs
         WHERE user_id = $1 AND session_id = s.id
         ORDER BY queued_at DESC
         LIMIT 1
       ) latest_evaluation ON true
       WHERE s.user_id = $1
       GROUP BY s.id, latest_revision.id, latest_revision.revision_number, latest_revision.created_at,
                latest_evaluation.status, latest_evaluation.result, latest_evaluation.completed_at
       ORDER BY s.updated_at DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      session: mapPracticeSession(row),
      revisionCount: Number(row.revision_count),
      latestRevision: row.latest_revision_id && row.latest_revision_number !== null && row.latest_revision_created_at !== null
        ? { id: row.latest_revision_id, revisionNumber: row.latest_revision_number, createdAt: iso(row.latest_revision_created_at)! }
        : null,
      evaluation: evaluationSummary(row),
    }));
  } finally {
    await db.close();
  }
}

export async function evaluatePracticeRevision(input: {
  userId: string;
  sessionId: string;
  revisionNumber: number;
}): Promise<EvaluatePracticeRevisionResult> {
  const db = createPracticeDatabaseClient();

  try {
    const sessionResult = await db.query<PracticeSessionRecord>(
      `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
       FROM practice_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [input.sessionId, input.userId],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Practice session not found');
    }

    const revisionResult = await db.query<{ content: string }>(
      `SELECT content
       FROM pseudocode_revisions
       WHERE session_id = $1 AND revision_number = $2
       LIMIT 1`,
      [input.sessionId, input.revisionNumber],
    );

    if (revisionResult.rows.length === 0) {
      throw new Error('Practice revision not found');
    }

    const evaluation = evaluatePseudocode(
      revisionResult.rows[0].content,
      fromPersistedContentId(sessionResult.rows[0].content_id),
    );

    return {
      evaluation: {
        sessionId: input.sessionId,
        revisionNumber: input.revisionNumber,
        approved: evaluation.approved,
        score: evaluation.score,
        summary: evaluation.summary,
        findings: evaluation.findings,
      },
    };
  } finally {
    await db.close();
  }
}

export async function completePracticeSession(input: {
  owner: PracticeOwner;
  sessionId: string;
  completed: boolean;
  currentStage?: PracticeSessionRecord['current_stage'];
}): Promise<CompletePracticeSessionResult> {
  const db = createPracticeDatabaseClient();

  try {
    const sessionResult = await db.query<PracticeSessionRecord>(
      `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
       FROM practice_sessions
       WHERE id = $1 AND ${ownerColumn(input.owner)} = $2
       LIMIT 1`,
      [input.sessionId, input.owner.id],
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Practice session not found');
    }

    const session = sessionResult.rows[0];
    const nextStage = input.currentStage ?? session.current_stage;
    const nextStatus = input.completed || session.status === 'completed' ? 'completed' : 'in_progress';

    const refreshed = await db.transaction(async (client) => {
      await client.query(
        `UPDATE practice_sessions
         SET current_stage = $2,
             status = $3,
             session_metadata = jsonb_set(session_metadata, '{completed}', to_jsonb($4::boolean), true),
             completed_at = CASE WHEN $4::boolean THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $5`,
        [input.sessionId, nextStage, nextStatus, nextStatus === 'completed', input.owner.id],
      );

      if (input.completed && session.status !== 'completed' && input.owner.kind === 'user') {
        const practiceItem = getPracticeItem(fromPersistedContentId(session.content_id));
        await createReviewStore(client).schedule(
          input.owner.id,
          practiceItem.conceptIds,
          100,
          new Date().toISOString(),
        );
      }

      return client.query<PracticeSessionRecord>(
        `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
         FROM practice_sessions
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $2
         LIMIT 1`,
        [input.sessionId, input.owner.id],
      );
    });

    return {
      session: mapPracticeSession(refreshed.rows[0]),
    };
  } finally {
    await db.close();
  }
}

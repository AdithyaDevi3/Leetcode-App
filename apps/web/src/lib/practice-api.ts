import { createDatabaseClient } from '@leetcode-app/database';
import { evaluatePseudocode } from './evaluator';

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
};

export type StartOrResumePracticeSessionInput = {
  userId: string;
  contentId: string;
};

export type StartOrResumePracticeSessionResult = {
  session: {
    id: string;
    contentId: string;
    currentStage: PracticeSessionRecord['current_stage'];
    status: PracticeSessionRecord['status'];
    revision: number;
    createdAt: string;
    updatedAt: string;
    sessionMetadata: Record<string, unknown>;
  };
  created: boolean;
};

export type PracticeSessionSummary = {
  id: string;
  contentId: string;
  currentStage: PracticeSessionRecord['current_stage'];
  status: PracticeSessionRecord['status'];
  revision: number;
  createdAt: string;
  updatedAt: string;
  sessionMetadata: Record<string, unknown>;
};

export type AppendPracticeRevisionInput = {
  userId: string;
  sessionId: string;
  draft: string;
  currentStage?: PracticeSessionRecord['current_stage'];
};

export type AppendPracticeRevisionResult = {
  revision: {
    sessionId: string;
    revisionNumber: number;
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
  contentId: session.content_id,
  currentStage: session.current_stage,
  status: session.status,
  revision: session.revision,
  createdAt: session.created_at.toISOString(),
  updatedAt: session.updated_at.toISOString(),
  sessionMetadata: session.session_metadata,
});

export function createPracticeDatabaseClient() {
  return createDatabaseClient({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'leetcode_app',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  });
}

export async function startOrResumePracticeSession(
  input: StartOrResumePracticeSessionInput,
): Promise<StartOrResumePracticeSessionResult> {
  const db = createPracticeDatabaseClient();

  try {
    const existing = await db.query<PracticeSessionRecord>(
      `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
       FROM practice_sessions
       WHERE user_id = $1 AND content_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.userId, input.contentId],
    );

    if (existing.rows.length > 0) {
      return {
        created: false,
        session: mapPracticeSession(existing.rows[0]),
      };
    }

    const created = await db.query<PracticeSessionRecord>(
      `INSERT INTO practice_sessions (
         user_id,
         content_id,
         current_stage,
         status,
         session_metadata,
         revision
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at`,
      [input.userId, input.contentId, 'understand', 'not_started', {}, 1],
    );

    return {
      created: true,
      session: mapPracticeSession(created.rows[0]),
    };
  } finally {
    await db.close();
  }
}

export async function appendPracticeRevision(
  input: AppendPracticeRevisionInput,
): Promise<AppendPracticeRevisionResult> {
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

    const session = sessionResult.rows[0];
    const nextRevisionNumberResult = await db.query<{ next_revision_number: string }>(
      `SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision_number
       FROM pseudocode_revisions
       WHERE practice_session_id = $1`,
      [session.id],
    );

    const nextRevisionNumber = Number(nextRevisionNumberResult.rows[0]?.next_revision_number ?? 1);
    const normalizedDraft = input.draft.trim();
    const stage = input.currentStage ?? session.current_stage;

    const result = await db.transaction(async () => {
      await db.query(
        `UPDATE practice_sessions
         SET session_metadata = jsonb_set(
               jsonb_set(session_metadata, '{draft}', $2::jsonb, true),
               '{currentStage}', to_jsonb($3::text),
               true
             ),
             current_stage = $3,
             status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END,
             revision = revision + 1,
             updated_at = NOW()
         WHERE id = $1 AND user_id = $4`,
        [session.id, JSON.stringify(normalizedDraft), stage, input.userId],
      );

      await db.query(
        `INSERT INTO pseudocode_revisions (practice_session_id, revision_number, content)
         VALUES ($1, $2, $3)`,
        [session.id, nextRevisionNumber, normalizedDraft],
      );

      return {
        revision: {
          sessionId: session.id,
          revisionNumber: nextRevisionNumber,
          draft: normalizedDraft,
          currentStage: stage,
          status: session.status === 'not_started' ? 'in_progress' : session.status,
          updatedAt: new Date().toISOString(),
        },
      } satisfies AppendPracticeRevisionResult;
    });

    return result;
  } finally {
    await db.close();
  }
}

export async function getPracticeSessionHistory(input: {
  userId: string;
  sessionId: string;
}): Promise<{ session: PracticeSessionSummary; revisions: PracticeRevisionEntry[] }> {
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

    const revisionResult = await db.query<{
      id: string;
      revision_number: number;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, revision_number, content, created_at
       FROM pseudocode_revisions
       WHERE practice_session_id = $1
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
       LEFT JOIN pseudocode_revisions r ON r.practice_session_id = s.id
       LEFT JOIN LATERAL (
         SELECT id, revision_number, created_at
         FROM pseudocode_revisions
         WHERE practice_session_id = s.id
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
       WHERE practice_session_id = $1 AND revision_number = $2
       LIMIT 1`,
      [input.sessionId, input.revisionNumber],
    );

    if (revisionResult.rows.length === 0) {
      throw new Error('Practice revision not found');
    }

    const evaluation = evaluatePseudocode(
      revisionResult.rows[0].content,
      sessionResult.rows[0].content_id,
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
  userId: string;
  sessionId: string;
  completed: boolean;
  currentStage?: PracticeSessionRecord['current_stage'];
}): Promise<CompletePracticeSessionResult> {
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

    const session = sessionResult.rows[0];
    const nextStage = input.currentStage ?? session.current_stage;
    const nextStatus = input.completed ? 'completed' : session.status === 'not_started' ? 'in_progress' : session.status;

    await db.query(
      `UPDATE practice_sessions
       SET current_stage = $2,
           status = $3,
           session_metadata = jsonb_set(session_metadata, '{completed}', to_jsonb($4::boolean), true),
           revision = revision + 1,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $5`,
      [input.sessionId, nextStage, nextStatus, input.completed, input.userId],
    );

    const refreshed = await db.query<PracticeSessionRecord>(
      `SELECT id, user_id, guest_id, content_id, current_stage, status, session_metadata, revision, created_at, updated_at
       FROM practice_sessions
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [input.sessionId, input.userId],
    );

    return {
      session: mapPracticeSession(refreshed.rows[0]),
    };
  } finally {
    await db.close();
  }
}

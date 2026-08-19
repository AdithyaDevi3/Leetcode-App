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
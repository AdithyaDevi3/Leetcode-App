import 'server-only';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createDatabaseClient, databaseConfigFromEnv } from '@leetcode-app/database';
import type { PracticeOwner } from './practice-api';
import { CODE_GRADING_MARKER, parseCodeGrade, type CodeGrade } from './code-grading';
import { fromPersistedContentId } from './content-id';
import { getPracticeItem } from './content';
import { deserializePracticeSession, type CodingLanguage } from './practice-session';
import { readPracticeVerification, restoreVerifiedWorkspace, type PracticeVerificationSnapshot } from './practice-verification-state';
import { createReviewStore } from './review-store';

type VerificationRequest = { id: string; source: string; language: CodingLanguage; workspaceRevision: number };
type VerificationSession = {
  id: string; content_id: string; revision: number;
  status: 'not_started' | 'in_progress' | 'completed'; session_metadata: Record<string, unknown>;
};
const ownerColumn = (owner: PracticeOwner) => owner.kind === 'user' ? 'user_id' : 'guest_id';

/** Reserve order before running code. Only the latest request can commit a result. */
export async function beginPracticeVerification(input: {
  owner: PracticeOwner; sessionId: string; source: string; language: CodingLanguage;
}): Promise<{ requestId: string }> {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    return await db.transaction(async client => {
      if (input.owner.kind === 'user') {
        const parent = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [input.owner.id]);
        if (!parent.rowCount) throw new Error('Practice session not found');
      }
      const result = await client.query<VerificationSession>(
        `SELECT id, content_id, revision, status, session_metadata FROM practice_sessions
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $2 FOR UPDATE`,
        [input.sessionId, input.owner.id],
      );
      const session = result.rows[0];
      if (!session) throw new Error('Practice session not found');
      const request: VerificationRequest = {
        id: randomUUID(), source: input.source, language: input.language, workspaceRevision: session.revision + 1,
      };
      await client.query(
        `UPDATE practice_sessions SET session_metadata = jsonb_set(session_metadata, '{verificationRequest}', $3::jsonb, true),
           revision = revision + 1, updated_at = NOW()
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $2`,
        [session.id, input.owner.id, JSON.stringify(request)],
      );
      return { requestId: request.id };
    });
  } finally { await db.close(); }
}

/** Commit a trusted report and completion/reviews together, before returning it. */
export async function finishPracticeVerification(input: {
  owner: PracticeOwner; sessionId: string; requestId: string; grade: CodeGrade;
}): Promise<boolean> {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    return await db.transaction(async client => {
      if (input.owner.kind === 'user') {
        const parent = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [input.owner.id]);
        if (!parent.rowCount) throw new Error('Practice session not found');
      }
      const result = await client.query<VerificationSession>(
        `SELECT id, content_id, revision, status, session_metadata FROM practice_sessions
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $2 FOR UPDATE`,
        [input.sessionId, input.owner.id],
      );
      const session = result.rows[0];
      if (!session) throw new Error('Practice session not found');
      const request = session.session_metadata.verificationRequest as VerificationRequest | undefined;
      if (!request || request.id !== input.requestId) return false;
      const problemId = fromPersistedContentId(session.content_id);
      const grade = parseCodeGrade(`${CODE_GRADING_MARKER}${JSON.stringify(input.grade)}`);
      if (!grade || grade.problemId !== problemId) throw new Error('Invalid verification report');
      const previous = readPracticeVerification(session.session_metadata.verification, problemId);
      if (previous?.requestId === request.id) {
        if (!isDeepStrictEqual(previous.grade, grade)) throw new Error('Verification result changed');
        return true;
      }

      const verification: PracticeVerificationSnapshot = {
        requestId: request.id, source: request.source, language: request.language, grade,
        verifiedAt: new Date().toISOString(),
      };
      const metadata: Record<string, unknown> = { ...session.session_metadata, verification };
      const current = session.session_metadata.workspaceState === undefined ? null
        : deserializePracticeSession(JSON.stringify(session.session_metadata.workspaceState));
      if (!current || session.revision === request.workspaceRevision
        || (current.code === request.source && current.language === request.language)) {
        metadata.workspaceState = restoreVerifiedWorkspace({ ...metadata, workspaceState: {
          draft: typeof metadata.draft === 'string' ? metadata.draft : '', mode: 'text',
          codeChecked: false, completed: false, evaluation: null, ...current,
          code: request.source, language: request.language,
        } }, problemId);
      }
      const completed = grade.passed || session.status === 'completed';
      metadata.completed = completed;
      await client.query(
        `UPDATE practice_sessions SET session_metadata = $3::jsonb,
           status = CASE WHEN $4::boolean THEN 'completed'::session_status ELSE 'in_progress'::session_status END,
           current_stage = CASE WHEN $5::boolean THEN 'evaluate' ELSE current_stage END,
           completed_at = CASE WHEN $5::boolean THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
           revision = revision + 1, updated_at = NOW()
         WHERE id = $1 AND ${ownerColumn(input.owner)} = $2`,
        [session.id, input.owner.id, JSON.stringify(metadata), completed, grade.passed],
      );
      if (grade.passed && session.status !== 'completed' && input.owner.kind === 'user') {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`practice-reviews:${input.owner.id}`]);
        await createReviewStore(client).schedule(input.owner.id, getPracticeItem(problemId).conceptIds, 100, verification.verifiedAt);
      }
      return true;
    });
  } finally { await db.close(); }
}

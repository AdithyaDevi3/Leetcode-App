import 'server-only';
import { NextResponse } from 'next/server';
import {
  createDatabaseClient, databaseConfigFromEnv, PostgresAssessmentDraftRepository, PostgresAdministrationRepository,
  AssessmentDraftAccessError, AssessmentDraftConflictError, AssessmentDraftValidationError,
} from '@leetcode-app/database';
import { canPerformAdministrationAction, toLearnerQuestion } from '@leetcode-app/domain';
import type { AssessmentWorkspace } from './assessment-author';
import type { AssessmentCopyPreview, AssessmentCopyResult } from './assessment-copy-api-types';
import { assessmentCopyId, AssessmentCopyInputError, parseAssessmentCopyQuery, parseAssessmentCopyRequest } from './assessment-copy-input';
import { assessmentUuid } from './assessment-draft-input';
import { getSession } from './auth/session';
import { getReviewedQuestionVersions } from './question-bank.server';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';
import { requestIdHeader } from './request-correlation';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-assessment-author' };
class AssessmentCopyApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function actor(request?: Request) {
  const session = await getSession({ failOnAuthError: true });
  if (!session) throw new AssessmentCopyApiError(401, 'authentication_required', 'Sign in to copy a quiz draft.');
  if (request && request.headers.get('x-assessment-author') !== session.user.id) {
    throw new AssessmentCopyApiError(409, 'owner_changed', 'Your account changed. Reopen the class workspace before copying.');
  }
  return session.user.id;
}
async function withAuthor<T>(actorId: string, workspace: AssessmentWorkspace, action: (repository: PostgresAssessmentDraftRepository) => Promise<T>) {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    if (workspace === 'admin') {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      if (!canPerformAdministrationAction(roles, 'classes.manage')) throw new AssessmentCopyApiError(403, 'forbidden', 'Class authoring permission is required.');
    } else {
      const result = await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId]);
      if (!['instructor', 'admin'].includes(result.rows[0]?.role)) throw new AssessmentCopyApiError(403, 'forbidden', 'Instructor permission is required.');
    }
    return await action(new PostgresAssessmentDraftRepository(db, { userId: actorId, role: workspace === 'admin' ? 'administrator' : 'instructor' }));
  } finally { await db.close(); }
}
async function preview(actorId: string, workspace: AssessmentWorkspace, classId: string, draftId: string): Promise<AssessmentCopyPreview> {
  return withAuthor(actorId, workspace, async repository => {
    const source = await repository.getDraft(draftId);
    if (source.id !== draftId || source.classId !== classId) throw new AssessmentDraftAccessError();
    const destinations = (await repository.listCopyDestinations()).map(item => ({ id: item.id, name: item.name }));
    const classroom = destinations.find(item => item.id === classId);
    if (!classroom) throw new AssessmentDraftAccessError();
    const catalog = new Map(getReviewedQuestionVersions().filter(question => question.status === 'reviewed').map(question => [question.versionId, question]));
    return { actorId, source: { id: source.id, classId: source.classId, className: classroom.name,
      title: source.title, instructions: source.instructions, revision: source.revision,
      questions: source.questions.map(item => ({ questionVersionId: item.questionVersionId, maxUnits: item.maxUnits,
        question: catalog.has(item.questionVersionId) ? toLearnerQuestion(catalog.get(item.questionVersionId)!) : null })) }, destinations };
  });
}
export async function readAssessmentCopyPreview(request: Request, draftId: string): Promise<AssessmentCopyPreview> {
  const actorId = await actor(request);
  const query = parseAssessmentCopyQuery(request, 'GET');
  return preview(actorId, query.workspace, query.classId!, assessmentCopyId(draftId));
}
export async function copyAssessmentDraft(request: Request, draftId: string): Promise<AssessmentCopyResult> {
  const actorId = await actor(request);
  const { workspace } = parseAssessmentCopyQuery(request, 'POST');
  const sourceDraftId = assessmentCopyId(draftId);
  const input = parseAssessmentCopyRequest(await decodeQuizRequest(request, 4096));
  return withAuthor(actorId, workspace, async repository => {
    // Catalog checks belong after receipt replay inside the repository. A lost
    // accepted copy must remain recoverable after a question is retired.
    const saved = await repository.copyDraft({ ...input, sourceDraftId,
      reason: 'Author copied a saved quiz into a private draft', requestId: request.headers.get(requestIdHeader) },
    getReviewedQuestionVersions().filter(question => question.status === 'reviewed').map(question => question.versionId));
    if (saved.id === sourceDraftId || !assessmentUuid.test(saved.id) || saved.classId !== input.destinationClassId || saved.createdBy !== actorId
      || saved.status !== 'draft' || saved.revision !== 1 || saved.availableAt !== null || saved.dueAt !== null || saved.closesAt !== null) {
      throw new Error('Copy receipt scope changed');
    }
    return { actorId, draftId: saved.id, classId: saved.classId };
  });
}
export type AssessmentCopyPageAccess = { status: 'authorized'; data: AssessmentCopyPreview }
  | { status: 'unauthenticated' | 'forbidden' | 'not_found' };
export async function readAssessmentCopyPage(workspace: AssessmentWorkspace, classId: string, draftId: string): Promise<AssessmentCopyPageAccess> {
  try {
    const actorId = await actor();
    if (!['teach', 'admin'].includes(workspace)) throw new AssessmentCopyInputError();
    return { status: 'authorized', data: await preview(actorId, workspace, assessmentCopyId(classId), assessmentCopyId(draftId)) };
  } catch (error) {
    if (error instanceof AssessmentCopyApiError && error.status === 401) return { status: 'unauthenticated' };
    if (error instanceof AssessmentCopyApiError && error.status === 403) return { status: 'forbidden' };
    if (error instanceof AssessmentDraftAccessError || error instanceof AssessmentCopyInputError) return { status: 'not_found' };
    throw error;
  }
}
export const assessmentCopyJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export function assessmentCopyFailure(error: unknown) {
  if (error instanceof AssessmentCopyApiError) return assessmentCopyJson({ code: error.code, error: error.message }, error.status);
  if (error instanceof AssessmentDraftAccessError) return assessmentCopyJson({ code: 'not_found', error: 'The source quiz or destination class is unavailable for this account.' }, 404);
  if (error instanceof AssessmentDraftConflictError) return assessmentCopyJson({ code: 'source_conflict', error: 'The source changed or this copy key was already used. Refresh and review the saved source before starting a new copy.' }, 409);
  if (error instanceof AssessmentDraftValidationError) return assessmentCopyJson({ code: 'invalid_request', error: 'The saved source contains unavailable questions or invalid content. Edit the source draft and choose reviewed questions before copying.' }, 400);
  if (error instanceof AssessmentCopyInputError || error instanceof QuizInputError) return assessmentCopyJson({ code: 'invalid_request', error: 'Choose a valid saved quiz, destination class and revision.' }, error instanceof QuizInputError ? error.status : 400);
  return assessmentCopyJson({ code: 'copy_unavailable', error: 'Quiz copying is temporarily unavailable. Keep the original request and retry to recover its receipt.' }, 503);
}

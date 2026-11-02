import 'server-only';
import { NextResponse } from 'next/server';
import {
  createDatabaseClient, databaseConfigFromEnv, PostgresAdministrationRepository, PostgresAssessmentDraftRepository,
  PostgresAssessmentTemplateRepository, AssessmentTemplateAccessError, AssessmentTemplateConflictError, AssessmentTemplateValidationError,
  type StoredAssessmentTemplate,
} from '@leetcode-app/database';
import { canPerformAdministrationAction, toLearnerQuestion } from '@leetcode-app/domain';
import { getSession } from './auth/session';
import { getReviewedQuestionVersions } from './question-bank.server';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';
import { requestIdHeader } from './request-correlation';
import { assessmentUuid } from './assessment-draft-input';
import {
  AssessmentTemplateInputError, templateId, templateWorkspace, templateLibraryQuery, templateDetailQuery,
  templateCreateCommand, templateMutationCommand, templateUseCommand,
} from './assessment-template-input';
import type {
  TemplateWorkspace, TemplateView, TemplateSummary, TemplateLibraryResponse, TemplateDetailResponse,
  TemplateMutationResponse, TemplateDraftResponse,
} from './assessment-template-api-types';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-assessment-author' };
class TemplateApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function verifiedActor(request?: Request) {
  const session = await getSession({ failOnAuthError: true });
  if (!session) throw new TemplateApiError(401, 'authentication_required', 'Sign in to manage your private quiz templates.');
  if (request && request.headers.get('x-assessment-author') !== session.user.id) {
    throw new TemplateApiError(409, 'owner_changed', 'Your account changed. Reopen the template workspace in the intended account.');
  }
  return session.user.id;
}
async function withAuthor<T>(actorId: string, workspace: TemplateWorkspace,
  action: (repository: PostgresAssessmentTemplateRepository, drafts: PostgresAssessmentDraftRepository) => Promise<T>) {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    if (workspace === 'admin') {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      if (!canPerformAdministrationAction(roles, 'classes.manage')) throw new TemplateApiError(403, 'forbidden', 'Class authoring permission is required.');
    } else {
      const user = await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId]);
      if (!['instructor', 'admin'].includes(user.rows[0]?.role)) throw new TemplateApiError(403, 'forbidden', 'Instructor permission is required.');
    }
    const principal = { userId: actorId, role: workspace === 'admin' ? 'administrator' as const : 'instructor' as const };
    return await action(new PostgresAssessmentTemplateRepository(db, principal), new PostgresAssessmentDraftRepository(db, principal));
  } finally { await db.close(); }
}
const pool = () => getReviewedQuestionVersions().filter(question => question.status === 'reviewed');
const availableIds = () => pool().map(question => question.versionId);
function scope(source: StoredAssessmentTemplate, id: string) {
  if (source.id !== id || !assessmentUuid.test(source.id) || !Number.isSafeInteger(source.revision) || source.revision < 1
    || !Number.isSafeInteger(source.version) || source.version < 1 || !Number.isSafeInteger(source.currentVersion)
    || source.currentVersion < source.version || source.currentVersion > source.revision
    || !['active', 'archived'].includes(source.status)) throw new Error('Template response scope changed');
}
function project(source: StoredAssessmentTemplate, id: string): TemplateView {
  scope(source, id);
  const catalog = new Map(pool().map(question => [question.versionId, question]));
  return { id: source.id, revision: source.revision, status: source.status, currentVersion: source.currentVersion, version: source.version,
    title: source.title, instructions: source.instructions, maxUnits: source.maxUnits,
    questions: source.questions.map(item => ({ questionVersionId: item.questionVersionId, maxUnits: item.maxUnits,
      question: catalog.has(item.questionVersionId) ? toLearnerQuestion(catalog.get(item.questionVersionId)!) : null })),
    createdAt: source.createdAt, updatedAt: source.updatedAt, versionCreatedAt: source.versionCreatedAt };
}
async function mutationResponse(actorId: string, repository: PostgresAssessmentTemplateRepository, source: StoredAssessmentTemplate, id: string): Promise<TemplateMutationResponse> {
  const accepted = project(source, id);
  const current = await repository.getTemplate(id);
  scope(current, id);
  if (current.revision < source.revision) throw new Error('Template revision moved backwards');
  return { actorId, template: accepted, currentRevision: current.revision };
}
export async function readTemplateLibrary(request: Request): Promise<TemplateLibraryResponse> {
  const actorId = await verifiedActor(request);
  const { workspace, ...query } = templateLibraryQuery(request);
  return withAuthor(actorId, workspace, async repository => {
    const result = await repository.listTemplates(query);
    const items = result.items.map((item): TemplateSummary => ({ id: item.id, revision: item.revision, status: item.status,
      currentVersion: item.currentVersion, title: item.title, questionCount: item.questionCount, maxUnits: item.maxUnits, updatedAt: item.updatedAt }));
    if (!Number.isSafeInteger(result.total) || result.total < items.length || items.length > 20
      || items.some(item => !assessmentUuid.test(item.id))) throw new Error('Template library response changed');
    return { actorId, items, total: result.total, page: query.page, pageSize: 20 };
  });
}
export async function createTemplateFromDraft(request: Request): Promise<TemplateMutationResponse> {
  const actorId = await verifiedActor(request);
  const workspace = templateWorkspace(request);
  const input = templateCreateCommand(await decodeQuizRequest(request, 32_000));
  const command = { sourceClassId: input.sourceClassId, sourceDraftId: input.sourceDraftId, expectedRevision: input.expectedRevision, requestKey: input.requestKey };
  return withAuthor(actorId, workspace, async repository => {
    const saved = await repository.createFromDraft({ ...command, reason: 'Author captured a saved quiz as a private template', requestId: request.headers.get(requestIdHeader) }, availableIds());
    if (!assessmentUuid.test(saved.id) || saved.id === command.sourceDraftId || saved.revision !== 1 || saved.version !== 1 || saved.currentVersion !== 1 || saved.status !== 'active') throw new Error('Template capture receipt changed');
    return mutationResponse(actorId, repository, saved, saved.id);
  });
}
export async function readTemplateDetail(request: Request, rawId: string): Promise<TemplateDetailResponse> {
  const actorId = await verifiedActor(request);
  const { workspace, version } = templateDetailQuery(request);
  const id = templateId(rawId);
  return withAuthor(actorId, workspace, async (repository, drafts) => {
    const saved = await repository.getTemplate(id, version);
    if (version !== undefined && saved.version !== version) throw new Error('Template version scope changed');
    const template = project(saved, id);
    const destinations = (await drafts.listCopyDestinations()).map(item => ({ id: item.id, name: item.name }));
    return { actorId, template, destinations, catalog: pool().map(toLearnerQuestion) };
  });
}
export async function mutateTemplate(request: Request, rawId: string): Promise<TemplateMutationResponse> {
  const actorId = await verifiedActor(request);
  const workspace = templateWorkspace(request), id = templateId(rawId);
  const command = templateMutationCommand(await decodeQuizRequest(request, 32_000));
  return withAuthor(actorId, workspace, async repository => {
    const common = { templateId: id, expectedRevision: command.expectedRevision, requestKey: command.requestKey, requestId: request.headers.get(requestIdHeader) };
    const saved = command.operation === 'update'
      ? await repository.updateTemplate({ ...common, content: command.content, reason: 'Author saved a new private template version' }, availableIds())
      : await repository.setArchived({ ...common, archived: command.archived, reason: command.archived ? 'Author archived a private quiz template' : 'Author restored a private quiz template' });
    scope(saved, id);
    if (saved.revision !== command.expectedRevision + 1 || (command.operation === 'update' && saved.status !== 'active')
      || (command.operation === 'set_archived' && saved.status !== (command.archived ? 'archived' : 'active'))) throw new Error('Template mutation receipt changed');
    return mutationResponse(actorId, repository, saved, id);
  });
}
export async function createTemplateDraft(request: Request, rawId: string): Promise<TemplateDraftResponse> {
  const actorId = await verifiedActor(request);
  const workspace = templateWorkspace(request), id = templateId(rawId);
  const command = templateUseCommand(await decodeQuizRequest(request, 32_000));
  return withAuthor(actorId, workspace, async repository => {
    // Receipt replay precedes new lifecycle/version/catalog checks in SQL.
    const saved = await repository.createDraft({ ...command, templateId: id, reason: 'Author used a private template for a new class quiz draft', requestId: request.headers.get(requestIdHeader) }, availableIds());
    if (!assessmentUuid.test(saved.id) || saved.id === id || saved.classId !== command.destinationClassId || saved.createdBy !== actorId || saved.status !== 'draft'
      || saved.revision !== 1 || saved.availableAt !== null || saved.dueAt !== null || saved.closesAt !== null) throw new Error('Template draft receipt scope changed');
    return { actorId, draftId: saved.id, classId: saved.classId };
  });
}
type PageDenied = { status: 'unauthenticated' | 'forbidden' | 'not_found' };
type PageAccess = { status: 'authorized'; actorId: string } | PageDenied;
const pageFailure = (error: unknown): PageDenied => {
  if (error instanceof TemplateApiError && error.status === 401) return { status: 'unauthenticated' };
  if (error instanceof TemplateApiError && error.status === 403) return { status: 'forbidden' };
  if (error instanceof AssessmentTemplateAccessError || error instanceof AssessmentTemplateInputError) return { status: 'not_found' };
  throw error;
};
export async function readTemplateLibraryPage(workspace: TemplateWorkspace): Promise<PageAccess> {
  try {
    const actorId = await verifiedActor();
    if (!['teach', 'admin'].includes(workspace)) throw new AssessmentTemplateInputError();
    await withAuthor(actorId, workspace, async repository => { await repository.listTemplates({ search: '', status: 'active', page: 1 }); });
    return { status: 'authorized', actorId };
  } catch (error) { return pageFailure(error); }
}
export async function readTemplateDetailPage(workspace: TemplateWorkspace, rawId: string): Promise<PageDenied | { status: 'authorized'; actorId: string; templateId: string }> {
  try {
    const actorId = await verifiedActor();
    if (!['teach', 'admin'].includes(workspace)) throw new AssessmentTemplateInputError();
    const id = templateId(rawId);
    await withAuthor(actorId, workspace, async repository => { scope(await repository.getTemplate(id), id); });
    return { status: 'authorized', actorId, templateId: id };
  } catch (error) { return pageFailure(error); }
}
export const templateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
export function templateFailure(error: unknown) {
  if (error instanceof TemplateApiError) return templateJson({ code: error.code, error: error.message }, error.status);
  if (error instanceof AssessmentTemplateAccessError) return templateJson({ code: 'not_found', error: 'This private template, saved source or destination class is unavailable for this account.' }, 404);
  if (error instanceof AssessmentTemplateConflictError) return templateJson({ code: 'template_conflict', error: 'The saved source or template changed, or this request key was already used. Keep your work and compare the latest saved version.' }, 409);
  if (error instanceof AssessmentTemplateValidationError) return templateJson({ code: 'invalid_request', error: 'Review the template lifecycle and replace unavailable questions before starting a new request.' }, 400);
  if (error instanceof AssessmentTemplateInputError || error instanceof QuizInputError) return templateJson({ code: 'invalid_request', error: 'Choose valid template content, a saved version and an authorized class.' }, error instanceof QuizInputError ? error.status : 400);
  return templateJson({ code: 'template_unavailable', error: 'Templates are temporarily unavailable. Keep the original request and retry to recover its receipt.' }, 503);
}

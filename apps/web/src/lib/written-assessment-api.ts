import 'server-only';
import { NextResponse } from 'next/server';
import {
  createDatabaseClient, databaseConfigFromEnv, PostgresAdministrationRepository, PostgresWrittenAssessmentRepository,
  WrittenAssessmentAccessError, WrittenAssessmentConflictError, WrittenAssessmentValidationError,
  type WrittenAssessmentDraft, type WrittenAuthorView, type WrittenPublication, type LearnerWrittenAssignment,
  type WrittenResponseDraft, type WrittenSubmissionReceipt,
} from '@leetcode-app/database';
import { canPerformAdministrationAction } from '@leetcode-app/domain';
import { getSession } from './auth/session';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';
import {
  WrittenAssessmentInputError, writtenId, writtenQuery, writtenDraftCommand, writtenPublishCommand, writtenSaveCommand, writtenSubmitCommand,
} from './written-assessment-input';
import type {
  WrittenWorkspace, WrittenListResponse, WrittenDetailResponse, WrittenDraftResponse, WrittenPublishResponse,
  WrittenLearnerResponse, WrittenSaveResponse, WrittenSubmitResponse,
} from './written-assessment-api-types';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-written-actor' };
class WrittenApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function verifiedActor(request?: Request): Promise<string> {
  const session = await getSession({ failOnAuthError: true });
  if (!session) throw new WrittenApiError(401, 'authentication_required', 'Sign in to open this assignment workspace.');
  if (request && request.headers.get('x-written-actor') !== session.user.id) {
    throw new WrittenApiError(409, 'owner_changed', 'Your account changed. Reopen this workspace in the intended account.');
  }
  if (writtenId(session.user.id) !== session.user.id) throw new Error('Invalid account identity');
  return session.user.id;
}
async function withRepository<T>(actorId: string, workspace: WrittenWorkspace | 'learner', action: (repository: PostgresWrittenAssessmentRepository) => Promise<T>): Promise<T> {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    if (workspace === 'admin') {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      if (!canPerformAdministrationAction(roles, 'classes.manage')) throw new WrittenApiError(403, 'forbidden', 'Class authoring permission is required.');
    } else if (workspace === 'teach') {
      const user = await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId]);
      if (!['instructor', 'admin'].includes(user.rows[0]?.role)) throw new WrittenApiError(403, 'forbidden', 'Instructor permission is required.');
    }
    return await action(new PostgresWrittenAssessmentRepository(db, { userId: actorId,
      role: workspace === 'admin' ? 'administrator' : workspace === 'teach' ? 'instructor' : 'learner' }));
  } finally { await db.close(); }
}
function ensure(condition: unknown): asserts condition { if (!condition) throw new Error('Written assessment response changed'); }
function validId(value: string): string { try { ensure(writtenId(value) === value); return value; } catch { throw new Error('Written assessment identity changed'); } }
function revision(value: number, minimum = 1): number { ensure(Number.isSafeInteger(value) && value >= minimum && value <= 2_147_483_647); return value; }
function instant(value: string): string { ensure(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value); return value; }
function date(value: string | null): string | null { return value === null ? null : instant(value); }
function plainText(value: string, maximum: number): string { ensure(typeof value === 'string' && value.length <= maximum); return value; }
function criteria(source: WrittenAssessmentDraft['criteria']): WrittenAssessmentDraft['criteria'] {
  ensure(Array.isArray(source) && source.length >= 1 && source.length <= 20);
  let total = 0; const seen = new Set<string>();
  return source.map(item => {
    ensure(typeof item.id === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(item.id) && !['constructor', 'prototype', '__proto__'].includes(item.id) && !seen.has(item.id));
    seen.add(item.id); ensure(typeof item.label === 'string' && item.label.trim().length >= 1 && item.label.length <= 160);
    ensure(Number.isSafeInteger(item.maxUnits) && item.maxUnits >= 1 && item.maxUnits <= 1_000_000);
    total += item.maxUnits; ensure(total <= 1_000_000);
    return { id: item.id, label: item.label, maxUnits: item.maxUnits };
  });
}
function projectDraft(source: WrittenAssessmentDraft, classId: string, draftId?: string): WrittenAssessmentDraft {
  ensure(source.classId === classId && (!draftId || source.id === draftId) && source.status === 'draft');
  const selected = criteria(source.criteria);
  ensure(source.maxUnits === selected.reduce((sum, item) => sum + item.maxUnits, 0));
  ensure(source.title.trim().length >= 3 && source.prompt.trim().length >= 1);
  return { id: validId(source.id), classId: validId(source.classId), createdBy: source.createdBy === null ? null : validId(source.createdBy),
    revision: revision(source.revision), status: 'draft', title: plainText(source.title, 160), instructions: plainText(source.instructions, 2_000),
    prompt: plainText(source.prompt, 20_000), criteria: selected, maxUnits: source.maxUnits,
    availableAt: date(source.availableAt), dueAt: date(source.dueAt), closesAt: date(source.closesAt),
    createdAt: instant(source.createdAt), updatedAt: instant(source.updatedAt) };
}
function projectPublication(source: WrittenPublication, draftId: string): WrittenPublication {
  ensure(source.draftId === draftId && ['class', 'selected'].includes(source.audienceKind)
    && Number.isSafeInteger(source.recipientCount) && source.recipientCount >= 1 && source.recipientCount <= 5_000);
  return { id: validId(source.id), draftId: validId(source.draftId), draftRevision: revision(source.draftRevision), classId: validId(source.classId),
    assignmentId: validId(source.assignmentId), policyVersionId: validId(source.policyVersionId), recipientCount: source.recipientCount,
    audienceKind: source.audienceKind, publishedAt: instant(source.publishedAt) };
}
function projectAuthor(source: WrittenAuthorView, classId: string, draftId: string): WrittenAuthorView {
  const draft = projectDraft(source.draft, classId, draftId);
  ensure(typeof source.rosterFingerprint === 'string' && /^[a-f0-9]{64}$/.test(source.rosterFingerprint) && Array.isArray(source.learners) && source.learners.length <= 5_000);
  const learners = source.learners.map(person => ({ id: validId(person.id), displayName: plainText(person.displayName, 500), email: person.email === null ? null : plainText(person.email, 500) }));
  ensure(new Set(learners.map(person => person.id)).size === learners.length);
  const publication = source.publication === null ? null : projectPublication(source.publication, draftId);
  if (publication) ensure(publication.classId === classId && publication.draftRevision <= draft.revision);
  return { draft, learners, rosterFingerprint: source.rosterFingerprint, publication };
}
function projectResponseDraft(source: WrittenResponseDraft): WrittenResponseDraft {
  const current = revision(source.revision, 0);
  ensure(typeof source.text === 'string' && new TextEncoder().encode(source.text).byteLength <= 100_000);
  ensure(current === 0 ? source.text === '' && source.updatedAt === null : source.updatedAt !== null);
  return { revision: current, text: source.text, updatedAt: date(source.updatedAt) };
}
function projectSubmission(source: WrittenSubmissionReceipt): WrittenSubmissionReceipt {
  ensure(typeof source.isLate === 'boolean');
  return { attemptId: validId(source.attemptId), responseRevisionId: validId(source.responseRevisionId), responseRevision: revision(source.responseRevision),
    submittedAt: instant(source.submittedAt), isLate: source.isLate };
}
function projectLearner(source: LearnerWrittenAssignment, recipientId: string): LearnerWrittenAssignment {
  ensure(source.recipientId === recipientId && typeof source.isOpen === 'boolean' && typeof source.isClosed === 'boolean' && typeof source.isExcused === 'boolean'
    && Number.isSafeInteger(source.maxUnits) && source.maxUnits >= 1 && source.maxUnits <= 1_000_000);
  const visible = source.isOpen && !source.isExcused;
  const selected = visible ? criteria(source.criteria) : [];
  if (visible) ensure(source.prompt.trim().length > 0 && source.maxUnits === selected.reduce((sum, item) => sum + item.maxUnits, 0));
  else ensure(source.prompt === '' && Array.isArray(source.criteria) && source.criteria.length === 0 && source.submission === null && source.releasedGrade === null);
  const responseDraft = projectResponseDraft(source.responseDraft);
  if (!visible) ensure(responseDraft.revision === 0);
  const submission = source.submission === null ? null : projectSubmission(source.submission);
  if (submission) ensure(submission.responseRevision === responseDraft.revision && !!responseDraft.text.trim());
  let releasedGrade: LearnerWrittenAssignment['releasedGrade'] = null;
  if (source.releasedGrade !== null) {
    const grade = source.releasedGrade;
    ensure(Number.isSafeInteger(grade.earnedUnits) && grade.earnedUnits >= 0 && grade.earnedUnits <= source.maxUnits
      && grade.criterionScores && typeof grade.criterionScores === 'object' && !Array.isArray(grade.criterionScores));
    const entries = Object.entries(grade.criterionScores);
    ensure(entries.length === 0 ? grade.earnedUnits === 0 : entries.length === selected.length && !!submission);
    let total = 0;
    const scores: Record<string, number> = {};
    for (const [id, score] of entries) {
      const criterion = selected.find(item => item.id === id);
      ensure(criterion && Number.isSafeInteger(score) && score >= 0 && score <= criterion.maxUnits);
      scores[id] = score; total += score;
    }
    ensure(total === grade.earnedUnits);
    releasedGrade = { gradeRevisionId: validId(grade.gradeRevisionId), earnedUnits: grade.earnedUnits, criterionScores: scores,
      learnerFeedback: plainText(grade.learnerFeedback, 10_000), publishedAt: instant(grade.publishedAt) };
  }
  return { recipientId: validId(source.recipientId), classId: validId(source.classId), assignmentId: validId(source.assignmentId), policyVersionId: validId(source.policyVersionId),
    title: plainText(source.title, 160), instructions: plainText(source.instructions, 2_000), prompt: plainText(source.prompt, 20_000), criteria: selected, maxUnits: source.maxUnits,
    availableAt: date(source.availableAt), dueAt: date(source.dueAt), closesAt: date(source.closesAt), responseDraft, submission, releasedGrade, isOpen: source.isOpen, isClosed: source.isClosed, isExcused: source.isExcused };
}

export async function readWrittenList(request: Request): Promise<WrittenListResponse> {
  const actorId = await verifiedActor(request), { workspace, classId } = writtenQuery(request, true, true);
  return withRepository(actorId, workspace, async repository => ({ actorId, classId: classId!, drafts: (await repository.listDrafts(classId!)).map(item => projectDraft(item, classId!)) }));
}
export async function saveWrittenDraft(request: Request): Promise<WrittenDraftResponse> {
  const actorId = await verifiedActor(request), { workspace } = writtenQuery(request, true);
  const command = writtenDraftCommand(await decodeQuizRequest(request, 160_000));
  return withRepository(actorId, workspace, async repository => {
    const accepted = await repository.saveDraft({ ...command, reason: 'Author saved a rubric-based written assignment draft' });
    const draft = projectDraft(accepted, command.draft.classId, command.draftId ?? undefined);
    ensure(draft.revision === (command.expectedRevision ?? 0) + 1 && (command.draftId !== null || draft.createdBy === actorId));
    const current = projectDraft(await repository.getDraft(draft.id, draft.classId), draft.classId, draft.id);
    ensure(current.revision >= draft.revision);
    return { actorId, draft, currentRevision: current.revision };
  });
}
export async function readWrittenDetail(request: Request, rawId: string): Promise<WrittenDetailResponse> {
  const actorId = await verifiedActor(request), { workspace, classId } = writtenQuery(request, true, true), draftId = writtenId(rawId);
  return withRepository(actorId, workspace, async repository => ({ actorId, author: projectAuthor(await repository.readAuthorDraft(draftId), classId!, draftId) }));
}
export async function publishWrittenDraft(request: Request, rawId: string): Promise<WrittenPublishResponse> {
  const actorId = await verifiedActor(request), { workspace } = writtenQuery(request, true), draftId = writtenId(rawId);
  const command = writtenPublishCommand(await decodeQuizRequest(request, 160_000));
  return withRepository(actorId, workspace, async repository => {
    const publication = projectPublication(await repository.publishDraft({ ...command, draftId, reason: 'Author explicitly assigned a frozen rubric-based written assessment' }), draftId);
    ensure(publication.draftRevision === command.expectedRevision && publication.recipientCount === command.audience.learnerIds.length && publication.audienceKind === command.audience.kind);
    return { actorId, publication };
  });
}
export async function readWrittenLearner(request: Request, rawId: string): Promise<WrittenLearnerResponse> {
  const actorId = await verifiedActor(request); writtenQuery(request, false); const recipientId = writtenId(rawId);
  return withRepository(actorId, 'learner', async repository => ({ actorId, assignment: projectLearner(await repository.readLearnerAssignment(recipientId), recipientId) }));
}
export async function saveWrittenResponse(request: Request, rawId: string): Promise<WrittenSaveResponse> {
  const actorId = await verifiedActor(request); writtenQuery(request, false); const recipientId = writtenId(rawId);
  const command = writtenSaveCommand(await decodeQuizRequest(request, 650_000));
  return withRepository(actorId, 'learner', async repository => {
    const accepted = await repository.saveResponse({ ...command, recipientId });
    const responseDraft = projectResponseDraft(accepted.responseDraft);
    ensure(responseDraft.revision === command.expectedRevision + 1 && responseDraft.text === command.text);
    const currentRevision = revision(accepted.currentRevision, responseDraft.revision);
    return { actorId, recipientId, responseDraft, currentRevision };
  });
}
export async function submitWrittenResponse(request: Request, rawId: string): Promise<WrittenSubmitResponse> {
  const actorId = await verifiedActor(request); writtenQuery(request, false); const recipientId = writtenId(rawId);
  const command = writtenSubmitCommand(await decodeQuizRequest(request, 2_000));
  return withRepository(actorId, 'learner', async repository => {
    const submission = projectSubmission(await repository.submitResponse({ ...command, recipientId }));
    ensure(submission.responseRevision === command.expectedRevision);
    return { actorId, recipientId, submission };
  });
}
type PageAccess<T> = { status: 'unauthenticated' } | { status: 'forbidden' } | { status: 'authorized'; data: T };
async function pageAccess<T>(action: (actorId: string) => Promise<T>): Promise<PageAccess<T>> {
  try { const actorId = await verifiedActor(); return { status: 'authorized', data: await action(actorId) }; }
  catch (error) {
    if (error instanceof WrittenApiError && error.status === 401) return { status: 'unauthenticated' };
    if (error instanceof WrittenAssessmentAccessError || (error instanceof WrittenApiError && error.status === 403)) return { status: 'forbidden' };
    throw error;
  }
}
export function readWrittenAuthorPage(workspace: WrittenWorkspace, rawClassId: string, rawDraftId?: string): Promise<PageAccess<WrittenListResponse | WrittenDetailResponse>> {
  return pageAccess(actorId => {
    if (workspace !== 'teach' && workspace !== 'admin') throw new WrittenAssessmentInputError();
    const classId = writtenId(rawClassId), draftId = rawDraftId === undefined ? undefined : writtenId(rawDraftId);
    return withRepository(actorId, workspace, async repository => draftId
      ? { actorId, author: projectAuthor(await repository.readAuthorDraft(draftId), classId, draftId) }
      : { actorId, classId, drafts: (await repository.listDrafts(classId)).map(item => projectDraft(item, classId)) });
  });
}
export function readWrittenLearnerPage(rawId: string): Promise<PageAccess<WrittenLearnerResponse>> {
  return pageAccess(actorId => { const recipientId = writtenId(rawId); return withRepository(actorId, 'learner', async repository => ({ actorId, assignment: projectLearner(await repository.readLearnerAssignment(recipientId), recipientId) })); });
}
export function writtenJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers }); }
export function writtenFailure(error: unknown) {
  if (error instanceof WrittenApiError) return writtenJson({ error: error.code, message: error.message }, error.status);
  if (error instanceof WrittenAssessmentInputError || error instanceof QuizInputError || error instanceof WrittenAssessmentValidationError) {
    return writtenJson({ error: 'invalid_request', message: 'Use valid assignment content, saved revisions and enrolled learners.' }, error instanceof QuizInputError ? error.status : 400);
  }
  if (error instanceof WrittenAssessmentAccessError) return writtenJson({ error: 'unavailable', message: 'This assignment is not available.' }, 404);
  if (error instanceof WrittenAssessmentConflictError) {
    const code = ['revision_changed', 'already_published', 'roster_changed', 'submitted'].includes(error.code) ? error.code : 'conflict';
    return writtenJson({ error: code, message: 'This work changed. Refresh and compare before sending a new command.',
      ...(Number.isSafeInteger(error.currentRevision) && Number(error.currentRevision) >= 0 && Number(error.currentRevision) <= 2_147_483_647 ? { currentRevision: error.currentRevision } : {}) }, 409);
  }
  return writtenJson({ error: 'temporarily_unavailable', message: 'The assignment service is temporarily unavailable. Keep your work and retry the same command.' }, 503);
}

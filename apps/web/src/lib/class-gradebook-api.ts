import 'server-only';

import { NextResponse } from 'next/server';
import {
  GradebookAccessError, GradebookConflictError, GradeReleaseValidationError,
  type AssignmentGradeReleasePreview, type AssignmentGradeReleaseReceipt, type ClassResultsSharingReceipt,
  type GradeReleaseContent, type GradeReleaseResponse, type GradeReleaseResponseDetail,
  type GradeReleaseAssignment, type GradeReleaseTarget, type SharedAssignmentResults, type SharedGradeResponseDetail, type StoredGradebookGrade,
} from '@leetcode-app/database';
import { readClassGradebookData, readClassGradeReleaseData, readSharedClassGradeData, type ClassGradebookAccess } from './class-gradebook-access';
import {
  ClassGradebookInputError, classGradebookCommandBytes, classGradebookId, classGradebookQuery,
  classGradebookReleaseCommand, classGradebookSharingCommand, classGradebookDraftCommand,
} from './class-gradebook-input';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-assessment-author' };
class ClassGradebookApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function ensure(value: unknown): asserts value { if (!value) throw new Error('Gradebook response validation failed'); }
function id(value: string): string {
  try { ensure(classGradebookId(value) === value); return value; }
  catch { throw new Error('Gradebook response identity changed'); }
}
function integer(value: number, minimum = 0, maximum = 2_147_483_647): number {
  ensure(Number.isSafeInteger(value) && value >= minimum && value <= maximum); return value;
}
function text(value: string, maximum: number): string { ensure(typeof value === 'string' && value.length <= maximum); return value; }
function instant(value: string): string {
  ensure(typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value); return value;
}
function classroom(source: { id: string; name: string }, classId: string) {
  ensure(source.id === classId); return { id: id(source.id), name: text(source.name, 500) };
}
function assignment(source: GradeReleaseAssignment, assignmentId?: string): GradeReleaseAssignment {
  ensure((assignmentId === undefined || source.id === assignmentId) && ['problem', 'quiz', 'written'].includes(source.kind));
  if (source.dueOn !== null) ensure(typeof source.dueOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.dueOn)
    && new Date(`${source.dueOn}T00:00:00.000Z`).toISOString().slice(0, 10) === source.dueOn);
  return { id: id(source.id), title: text(source.title, 160), kind: source.kind, instructions: text(source.instructions, 2_000),
    dueOn: source.dueOn, closesAt: source.closesAt === null ? null : instant(source.closesAt),
    maxUnits: integer(source.maxUnits, 1, 1_000_000), policyVersionId: id(source.policyVersionId) };
}
function content(source: GradeReleaseContent): GradeReleaseContent {
  ensure(Array.isArray(source.questions) && source.questions.length <= 30);
  const questions = source.questions.map(question => {
    ensure(Array.isArray(question.options) && question.options.length <= 20);
    const options = question.options.map(option => ({ id: text(option.id, 200), text: text(option.text, 20_000) }));
    ensure(new Set(options.map(option => option.id)).size === options.length);
    return { id: text(question.id, 200), title: text(question.title, 500), prompt: text(question.prompt, 100_000), options,
      maxUnits: question.maxUnits === null ? null : integer(question.maxUnits, 1, 1_000_000) };
  });
  ensure(new Set(questions.map(question => question.id)).size === questions.length);
  return { prompt: text(source.prompt, 100_000), questions };
}
function response(source: GradeReleaseResponse | null, selected: GradeReleaseContent): GradeReleaseResponse | null {
  if (source === null) return null;
  ensure(source.answers && typeof source.answers === 'object' && !Array.isArray(source.answers));
  const entries = Object.entries(source.answers);
  ensure(entries.length <= 30);
  const answers: Record<string, string | null> = Object.create(null);
  for (const [key, value] of entries) {
    const question = selected.questions.find(item => item.id === key);
    ensure(question && (value === null || typeof value === 'string' && question.options.some(option => option.id === value)));
    answers[key] = value;
  }
  if (source.text !== null) ensure(new TextEncoder().encode(text(source.text, 100_000)).byteLength <= 100_000);
  return { attemptId: id(source.attemptId), sequence: integer(source.sequence, 1), submittedAt: instant(source.submittedAt),
    text: source.text, language: source.language === null ? null : text(source.language, 80), answers };
}
function releaseTarget(source: GradeReleaseTarget | null, recipientId: string | null): GradeReleaseTarget | null {
  if (source === null) return null;
  ensure(source.recipientId === recipientId);
  return { recipientId: id(source.recipientId), gradeRevisionId: id(source.gradeRevisionId), expectedPublicationSequence: integer(source.expectedPublicationSequence) };
}
function sharing(source: ClassResultsSharingReceipt, classId: string, assignmentId: string): ClassResultsSharingReceipt {
  ensure(source.classId === classId && source.assignmentId === assignmentId && typeof source.shared === 'boolean');
  return { id: id(source.id), classId: id(source.classId), assignmentId: id(source.assignmentId), sequence: integer(source.sequence, 1),
    shared: source.shared, recipientCount: integer(source.recipientCount, 0, 500), createdAt: instant(source.createdAt) };
}
const states = new Set(['not_assigned', 'excused', 'unsubmitted', 'queued', 'running', 'needs_review', 'unavailable', 'draft', 'published']);
function preview(source: AssignmentGradeReleasePreview, classId: string, assignmentId: string): AssignmentGradeReleasePreview {
  const selected = content(source.content), assigned = assignment(source.assignment, assignmentId);
  ensure(typeof source.archived === 'boolean' && Array.isArray(source.roster) && source.roster.length <= 5_000);
  const roster = source.roster.map(row => {
    ensure(['included', 'withdrawn'].includes(row.membership) && states.has(row.state) && typeof row.ready === 'boolean');
    const recipientId = row.recipientId === null ? null : id(row.recipientId);
    const target = releaseTarget(row.releaseTarget, recipientId);
    ensure(row.ready === (target !== null));
    const shareTarget = row.shareTarget === null ? null : {
      recipientId: id(row.shareTarget.recipientId), gradeRevisionId: id(row.shareTarget.gradeRevisionId),
      publicationId: id(row.shareTarget.publicationId), attemptId: row.shareTarget.attemptId === null ? null : id(row.shareTarget.attemptId),
    };
    if (shareTarget) ensure(shareTarget.recipientId === recipientId);
    // The roster carries response metadata only. Full answers are fetched on demand by recipient.
    const submitted = response(row.response, selected);
    return { learner: { id: id(row.learner.id), displayName: text(row.learner.displayName, 500), email: row.learner.email === null ? null : text(row.learner.email, 500) },
      membership: row.membership, recipientId, state: row.state, earnedUnits: row.earnedUnits === null ? null : integer(row.earnedUnits, 0, assigned.maxUnits),
      maxUnits: integer(row.maxUnits, 1, 1_000_000), ready: row.ready, reason: row.reason === null ? null : text(row.reason, 500), releaseTarget: target, shareTarget,
      response: submitted === null ? null : { ...submitted, text: null, language: null, answers: {} } };
  });
  ensure(new Set(roster.map(row => row.learner.id)).size === roster.length);
  return { classroom: classroom(source.classroom, classId), assignment: assigned, archived: source.archived, content: selected, roster,
    sharing: source.sharing === null ? null : sharing(source.sharing, classId, assignmentId) };
}
function detail(source: GradeReleaseResponseDetail, classId: string, recipientId: string): GradeReleaseResponseDetail {
  ensure(source.recipientId === recipientId && states.has(source.state));
  const selected = content(source.content), assigned = assignment(source.assignment);
  let grade: GradeReleaseResponseDetail['grade'] = null;
  if (source.grade !== null) {
    const value = source.grade;
    ensure(typeof value.published === 'boolean' && value.criterionScores && typeof value.criterionScores === 'object' && !Array.isArray(value.criterionScores));
    const criterionScores: Record<string, number> = Object.create(null);
    for (const [key, score] of Object.entries(value.criterionScores)) {
      ensure(/^[a-z][a-z0-9_-]{0,79}$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key));
      criterionScores[key] = integer(score, 0, assigned.maxUnits);
    }
    grade = { id: id(value.id), earnedUnits: integer(value.earnedUnits, 0, assigned.maxUnits), maxUnits: integer(value.maxUnits, 1, 1_000_000),
      criterionScores, learnerFeedback: text(value.learnerFeedback, 10_000), published: value.published, publicationSequence: integer(value.publicationSequence) };
  }
  return { classroom: classroom(source.classroom, classId), assignment: assigned, content: selected,
    learner: { id: id(source.learner.id), displayName: text(source.learner.displayName, 500), email: source.learner.email === null ? null : text(source.learner.email, 500) },
    recipientId: id(source.recipientId), response: response(source.response, selected), state: source.state, grade,
    releaseTarget: releaseTarget(source.releaseTarget, recipientId) };
}
function releaseReceipt(source: AssignmentGradeReleaseReceipt, classId: string, assignmentId: string, actorId: string, targets: readonly GradeReleaseTarget[]): AssignmentGradeReleaseReceipt {
  ensure(source.classId === classId && source.assignmentId === assignmentId && source.actorId === actorId
    && Array.isArray(source.publications) && source.publications.length === targets.length);
  const publications = source.publications.map(row => {
    const target = targets.find(item => item.recipientId === row.recipientId);
    ensure(target && row.publication.gradeRevisionId === target.gradeRevisionId && row.publication.sequence === target.expectedPublicationSequence + 1);
    return { recipientId: id(row.recipientId), publication: { id: id(row.publication.id), sequence: integer(row.publication.sequence, 1),
      gradeRevisionId: id(row.publication.gradeRevisionId), publishedAt: instant(row.publication.publishedAt) } };
  });
  ensure(new Set(publications.map(row => row.recipientId)).size === publications.length);
  return { id: id(source.id), classId: id(source.classId), assignmentId: id(source.assignmentId), actorId: id(source.actorId), createdAt: instant(source.createdAt), publications };
}
function sharedResults(source: SharedAssignmentResults, classId: string, assignmentId: string): SharedAssignmentResults {
  const selected = content(source.content), assigned = assignment(source.assignment, assignmentId);
  ensure(Array.isArray(source.learners) && source.learners.length <= 500);
  const publication = sharing(source.sharing, classId, assignmentId); ensure(publication.shared);
  const learners = source.learners.map(row => {
    const submitted = response(row.response, selected);
    return { learner: { id: id(row.learner.id), displayName: text(row.learner.displayName, 500) }, recipientId: id(row.recipientId),
      earnedUnits: integer(row.earnedUnits, 0, assigned.maxUnits), maxUnits: integer(row.maxUnits, 1, 1_000_000),
      response: submitted === null ? null : { ...submitted, text: null, language: null, answers: {} } };
  });
  ensure(new Set(learners.map(row => row.recipientId)).size === learners.length);
  return { classroom: classroom(source.classroom, classId), assignment: assigned, content: selected, sharing: publication, learners };
}
function sharedDetail(source: SharedGradeResponseDetail, classId: string, assignmentId: string, recipientId: string): SharedGradeResponseDetail {
  const selected = content(source.content), assigned = assignment(source.assignment, assignmentId);
  const publication = sharing(source.sharing, classId, assignmentId); ensure(publication.shared);
  ensure(source.recipientId === recipientId);
  return { classroom: classroom(source.classroom, classId), assignment: assigned, content: selected,
    learner: { id: id(source.learner.id), displayName: text(source.learner.displayName, 500) }, recipientId: id(source.recipientId),
    earnedUnits: integer(source.earnedUnits, 0, assigned.maxUnits), maxUnits: integer(source.maxUnits, 1, 1_000_000), response: response(source.response, selected), sharing: publication };
}
function actor(request: Request, actorId: string, required = false) {
  const expected = request.headers.get('x-assessment-author');
  if ((required || expected !== null) && expected !== actorId) throw new ClassGradebookApiError(409, 'owner_changed', 'Your account changed. Reopen this workspace in the intended account.');
}
function authorized<T>(access: ClassGradebookAccess<T>): T {
  if (access.status === 'unauthenticated') throw new ClassGradebookApiError(401, 'authentication_required', 'Sign in to open class grades.');
  if (access.status === 'forbidden') throw new ClassGradebookApiError(403, 'forbidden', 'Class gradebook permission is required.');
  return access.data;
}
async function body(request: Request): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new ClassGradebookInputError();
  return decodeQuizRequest(request, classGradebookCommandBytes);
}

export async function readAssignmentGradeRelease(request: Request, rawClassId: string, rawAssignmentId: string) {
  const workspace = classGradebookQuery(request)!;
  return authorized(await readClassGradeReleaseData(workspace, async (repository, user) => {
    actor(request, user.id); const classId = classGradebookId(rawClassId), assignmentId = classGradebookId(rawAssignmentId);
    return { actorId: user.id, preview: preview(await repository.readAssignment(classId, assignmentId), classId, assignmentId) };
  }));
}
export async function readGradeReleaseResponse(request: Request, rawClassId: string, rawRecipientId: string) {
  const workspace = classGradebookQuery(request)!;
  return authorized(await readClassGradeReleaseData(workspace, async (repository, user) => {
    actor(request, user.id); const classId = classGradebookId(rawClassId), recipientId = classGradebookId(rawRecipientId);
    return { actorId: user.id, detail: detail(await repository.readResponseDetail(classId, recipientId), classId, recipientId) };
  }));
}
export async function releaseAssignmentGrades(request: Request, rawClassId: string, rawAssignmentId: string) {
  const workspace = classGradebookQuery(request)!;
  return authorized(await readClassGradeReleaseData(workspace, async (repository, user) => {
    actor(request, user.id, true); const classId = classGradebookId(rawClassId), assignmentId = classGradebookId(rawAssignmentId);
    const command = classGradebookReleaseCommand(await body(request));
    const receipt = releaseReceipt(await repository.publishAssignmentGrades({ ...command, classId, assignmentId,
      reason: 'Authorized class manager explicitly released the reviewed saved grades to their individual learners' }), classId, assignmentId, user.id, command.targets);
    return { actorId: user.id, receipt };
  }));
}
export async function saveClassGradeDraft(request: Request, rawClassId: string, rawRecipientId: string) {
  const workspace = classGradebookQuery(request)!;
  return authorized(await readClassGradebookData(workspace, async (repository, user) => {
    actor(request, user.id, true); const classId = classGradebookId(rawClassId), recipientId = classGradebookId(rawRecipientId);
    const command = classGradebookDraftCommand(await body(request));
    const history = await repository.readRecipient(recipientId);
    if (history.assignment.classId !== classId) throw new GradebookAccessError();
    if (history.policy.scoring.mode !== 'reviewed_rubric') throw new ClassGradebookInputError();
    const criteria = history.policy.scoring.criteria;
    if (Object.keys(command.criterionScores).length !== criteria.length || criteria.some(criterion =>
      !Object.hasOwn(command.criterionScores, criterion.id) || command.criterionScores[criterion.id] > criterion.maxUnits)) throw new ClassGradebookInputError();
    const saved = await repository.appendGrade({ ...command, recipientId, expectedClassId: classId, kind: 'scored',
      reason: 'Authorized class manager saved a reviewed rubric grade draft' });
    ensure(saved.kind === 'scored' && saved.attemptId === command.attemptId && saved.learnerFeedback === command.learnerFeedback
      && saved.privateNote === command.privateNote && Object.keys(saved.criterionScores).length === criteria.length
      && criteria.every(criterion => saved.criterionScores[criterion.id] === command.criterionScores[criterion.id])
      && saved.earnedUnits === Object.values(command.criterionScores).reduce((sum, score) => sum + score, 0));
    const grade: StoredGradebookGrade = { id: id(saved.id), sequence: integer(saved.sequence, 1), kind: 'scored', attemptId: id(saved.attemptId),
      earnedUnits: integer(saved.earnedUnits, 0, history.policy.maxUnits), criterionScores: { ...command.criterionScores },
      learnerFeedback: text(saved.learnerFeedback, 10_000), privateNote: text(saved.privateNote, 10_000), createdAt: instant(saved.createdAt) };
    return { actorId: user.id, grade };
  }));
}
export async function changeClassResultsSharing(request: Request, rawClassId: string, rawAssignmentId: string) {
  const workspace = classGradebookQuery(request)!;
  return authorized(await readClassGradeReleaseData(workspace, async (repository, user) => {
    actor(request, user.id, true); const classId = classGradebookId(rawClassId), assignmentId = classGradebookId(rawAssignmentId);
    const command = classGradebookSharingCommand(await body(request));
    const source = command.action === 'publish' ? await repository.publishClassResults({ classId, assignmentId, targets: command.targets,
      expectedSharingSequence: command.expectedSharingSequence, requestKey: command.requestKey,
      reason: 'Authorized class manager explicitly shared the reviewed names, released scores and submitted answers with current classmates' })
      : await repository.revokeClassResults({ classId, assignmentId, expectedSharingSequence: command.expectedSharingSequence, requestKey: command.requestKey,
        reason: 'Authorized class manager explicitly revoked class-readable assignment results' });
    const receipt = sharing(source, classId, assignmentId);
    ensure(receipt.sequence === command.expectedSharingSequence + 1 && receipt.shared === (command.action === 'publish')
      && receipt.recipientCount === (command.action === 'publish' ? command.targets.length : 0));
    return { actorId: user.id, receipt };
  }));
}
export async function readSharedAssignmentResults(request: Request, rawClassId: string, rawAssignmentId: string) {
  classGradebookQuery(request, true);
  return authorized(await readSharedClassGradeData(async (repository, user) => {
    actor(request, user.id); const classId = classGradebookId(rawClassId), assignmentId = classGradebookId(rawAssignmentId);
    return { actorId: user.id, results: sharedResults(await repository.readSharedAssignment(classId, assignmentId), classId, assignmentId) };
  }));
}
export async function readSharedAssignmentResponse(request: Request, rawClassId: string, rawAssignmentId: string, rawRecipientId: string) {
  classGradebookQuery(request, true);
  return authorized(await readSharedClassGradeData(async (repository, user) => {
    actor(request, user.id); const classId = classGradebookId(rawClassId), assignmentId = classGradebookId(rawAssignmentId), recipientId = classGradebookId(rawRecipientId);
    return { actorId: user.id, detail: sharedDetail(await repository.readSharedResponseDetail(classId, assignmentId, recipientId), classId, assignmentId, recipientId) };
  }));
}
export function classGradebookJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers }); }
export function classGradebookFailure(error: unknown) {
  let status = 503, code = 'temporarily_unavailable', message = 'Class grades are temporarily unavailable. Keep the reviewed command and retry.';
  if (error instanceof ClassGradebookApiError) { status = error.status; code = error.code; message = error.message; }
  else if (error instanceof ClassGradebookInputError || error instanceof QuizInputError || error instanceof GradeReleaseValidationError) {
    status = error instanceof QuizInputError ? error.status : 400; code = 'invalid_request'; message = 'Use valid saved grades and distinct reviewed targets, up to 500 at a time.';
  } else if (error instanceof GradebookAccessError) { status = 404; code = 'unavailable'; message = 'These class grades are not available.'; }
  else if (error instanceof GradebookConflictError) { status = 409; code = 'conflict'; message = 'These records changed. Refresh and compare before creating a new command.'; }
  return classGradebookJson({ error: code, code, message }, status);
}

import { NextResponse } from 'next/server';
import {
  createDatabaseClient, databaseConfigFromEnv, PostgresPracticeDiagnosticRepository,
  DiagnosticAccessError, DiagnosticConflictError, DiagnosticValidationError,
  type DiagnosticView,
} from '@leetcode-app/database';
import { getSession } from './auth/session';
import { assessmentUuid } from './assessment-draft-input';
import { practiceItems } from './content';
import { getDiagnosticQuestionVersions } from './diagnostic-catalog.server';
import { decodeQuizRequest, parseQuizAnswerSaveRequest, parseQuizSubmissionRequest, QuizInputError } from './quiz-assignment-input';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-diagnostic-owner' };
class DiagnosticApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function owner(request: Request, write: boolean) {
  const session = await getSession({ failOnAuthError: true });
  if (!session) throw new DiagnosticApiError(401, 'authentication_required', 'Sign in to save your skills check.');
  const expected = request.headers.get('x-diagnostic-owner');
  if ((write || expected !== null) && expected !== session.user.id) {
    throw new DiagnosticApiError(409, 'owner_changed', 'Your account changed. Reopen the skills check in the intended account.');
  }
  return session.user.id;
}
function validId(id: string) {
  if (!assessmentUuid.test(id)) throw new DiagnosticApiError(400, 'invalid_request', 'Choose a valid skills check.');
}
function validKey(key: string) {
  if (!assessmentUuid.test(key)) throw new QuizInputError('Use a valid request key.');
}
async function withRepository<T>(userId: string, action: (repository: PostgresPracticeDiagnosticRepository) => Promise<T>): Promise<T> {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    return await action(new PostgresPracticeDiagnosticRepository(db, userId, {
      questions: getDiagnosticQuestionVersions(), activityIds: practiceItems.map(item => item.id),
    }));
  } finally { await db.close(); }
}

/** Explicit response projection: answer keys and explanations appear only after final submission. */
export function diagnosticApiView(view: DiagnosticView): DiagnosticView {
  return {
    id: view.id, selectionVersion: view.selectionVersion, createdAt: view.createdAt,
    questions: view.questions.map(question => ({
      versionId: question.versionId, questionId: question.questionId, version: question.version, kind: question.kind,
      title: question.title, prompt: question.prompt, options: question.options.map(option => ({ id: option.id, text: option.text })),
      difficulty: question.difficulty, conceptIds: [...question.conceptIds], activityIds: [...question.activityIds],
    })),
    answerDraft: { revision: view.answerDraft.revision, answers: Object.fromEntries(view.questions.map(question => [question.versionId, view.answerDraft.answers[question.versionId] ?? null])), updatedAt: view.answerDraft.updatedAt },
    submission: view.submission ? { diagnosticId: view.submission.diagnosticId, requestKey: view.submission.requestKey,
      answerRevision: view.submission.answerRevision, submittedAt: view.submission.submittedAt } : null,
    feedback: view.submission && view.feedback ? {
      answeredCount: view.feedback.answeredCount, correctCount: view.feedback.correctCount, totalQuestions: view.feedback.totalQuestions,
      items: view.feedback.items.map(item => ({ questionVersionId: item.questionVersionId, selectedOptionId: item.selectedOptionId,
        correct: item.correct, correctOptionId: item.correctOptionId, explanation: item.explanation })),
    } : null,
  };
}
export async function listDiagnostics(request: Request) {
  const learnerId = await owner(request, false);
  const result = await withRepository(learnerId, repository => repository.list());
  return { learnerId, current: result.current ? diagnosticApiView(result.current) : null,
    history: result.history.map(item => ({ id: item.id, selectionVersion: item.selectionVersion, submittedAt: item.submittedAt,
      answeredCount: item.answeredCount, correctCount: item.correctCount, totalQuestions: item.totalQuestions })) };
}
export async function startDiagnostic(request: Request) {
  const learnerId = await owner(request, true);
  const body = await decodeQuizRequest(request, 1_000);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new QuizInputError('Start with an empty request.');
  return { learnerId, diagnostic: diagnosticApiView(await withRepository(learnerId, repository => repository.start())) };
}
export async function readDiagnostic(request: Request, diagnosticId: string) {
  const learnerId = await owner(request, false); validId(diagnosticId);
  return { learnerId, diagnostic: diagnosticApiView(await withRepository(learnerId, repository => repository.read(diagnosticId))) };
}
export async function saveDiagnostic(request: Request, diagnosticId: string) {
  const learnerId = await owner(request, true); validId(diagnosticId);
  const input = parseQuizAnswerSaveRequest(await decodeQuizRequest(request, 16_000)); validKey(input.requestKey);
  const saved = await withRepository(learnerId, repository => repository.save(diagnosticId, input));
  return { learnerId, receipt: { diagnosticId: saved.diagnosticId, requestKey: saved.requestKey, currentRevision: saved.currentRevision,
    answerDraft: { revision: saved.answerDraft.revision, answers: saved.answerDraft.answers, updatedAt: saved.answerDraft.updatedAt } } };
}
export async function submitDiagnostic(request: Request, diagnosticId: string) {
  const learnerId = await owner(request, true); validId(diagnosticId);
  const input = parseQuizSubmissionRequest(await decodeQuizRequest(request, 2_000)); validKey(input.requestKey);
  const saved = await withRepository(learnerId, repository => repository.submit(diagnosticId, input));
  return { learnerId, receipt: { diagnosticId: saved.diagnosticId, requestKey: saved.requestKey,
    answerRevision: saved.answerRevision, submittedAt: saved.submittedAt } };
}
export function diagnosticJson(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
export function diagnosticFailure(error: unknown) {
  if (error instanceof DiagnosticApiError) return diagnosticJson({ code: error.code, error: error.message }, error.status);
  if (error instanceof QuizInputError) return diagnosticJson({ code: 'invalid_request', error: error.message }, error.status);
  if (error instanceof DiagnosticAccessError) return diagnosticJson({ code: 'not_found', error: 'This skills check is unavailable for your account.' }, 404);
  if (error instanceof DiagnosticConflictError) return diagnosticJson({ code: error.code, error: 'Saved answers changed. Compare both versions before continuing.' }, 409);
  if (error instanceof DiagnosticValidationError) return diagnosticJson({ code: 'invalid_request', error: 'The skills check could not accept this request. Your last saved answers are preserved.' }, 400);
  return diagnosticJson({ code: 'diagnostic_unavailable', error: 'Your skills check is temporarily unavailable. Your choices are preserved; try again.' }, 503);
}

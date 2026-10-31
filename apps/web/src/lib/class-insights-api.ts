import 'server-only';
import { NextResponse } from 'next/server';
import {
  createDatabaseClient, databaseConfigFromEnv, PostgresAdministrationRepository,
  PostgresClassInsightsRepository, ClassInsightsAccessError,
} from '@leetcode-app/database';
import { buildClassFollowUp, canPerformAdministrationAction, toLearnerQuestion, type ClassInsightsReport } from '@leetcode-app/domain';
import { getSession } from './auth/session';
import { getReviewedQuestionVersions } from './question-bank.server';
import { classInsightsFocus, classInsightsId, classInsightsQuery, ClassInsightsInputError } from './class-insights-input';
import type { ClassInsightsResponse, ClassInsightsWorkspace } from './class-insights-api-types';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-class-insights-owner' };
const questions = () => getReviewedQuestionVersions();
export const classInsightConceptIds = () => [...new Set(questions().flatMap(question => [...question.conceptIds]))].sort();
export class ClassInsightsApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
async function authenticatedActor(request?: Request) {
  const session = await getSession({ failOnAuthError: true });
  if (!session) throw new ClassInsightsApiError(401, 'authentication_required', 'Sign in to view class insights.');
  const expected = request?.headers.get('x-class-insights-owner');
  if (expected !== null && expected !== undefined && expected !== session.user.id) {
    throw new ClassInsightsApiError(409, 'owner_changed', 'Your account changed. Reopen the class workspace.');
  }
  return session.user.id;
}
async function withClassInsights<T>(actorId: string, workspace: ClassInsightsWorkspace, action: (repository: PostgresClassInsightsRepository) => Promise<T>) {
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    if (workspace === 'admin') {
      const roles = await new PostgresAdministrationRepository(db).listActiveRoles(actorId);
      if (!canPerformAdministrationAction(roles, 'classes.insights.read')) throw new ClassInsightsApiError(403, 'forbidden', 'Class insight permission is required.');
    } else {
      const role = await db.query<{ role: string }>('SELECT role FROM users WHERE id=$1', [actorId]);
      if (!['instructor', 'admin'].includes(role.rows[0]?.role)) throw new ClassInsightsApiError(403, 'forbidden', 'Instructor access is required.');
    }
    return await action(new PostgresClassInsightsRepository(db, { userId: actorId,
      role: workspace === 'admin' ? 'administrator' : 'instructor', conceptIds: classInsightConceptIds() }));
  } finally { await db.close(); }
}
function safeReport(source: ClassInsightsReport): ClassInsightsReport {
  return { algorithmVersion: source.algorithmVersion, classroom: { id: source.classroom.id, name: source.classroom.name },
    generatedAt: source.generatedAt, view: source.view, adminMinimumLearners: source.adminMinimumLearners, rosterCount: source.rosterCount,
    concepts: source.concepts.map(item => {
      const hidden = source.view === 'administrator' && (item.coveredLearners === null || item.coveredLearners < 5);
      return { conceptId: item.conceptId, coverageStatus: hidden ? item.coverageStatus === 'unknown' ? 'unknown' : 'suppressed' : item.coverageStatus,
        answeredItems: hidden ? null : item.answeredItems, correctItems: hidden ? null : item.correctItems,
        coveredLearners: hidden ? null : item.coveredLearners, distinctQuestions: hidden ? null : item.distinctQuestions,
        observedCorrectPercent: hidden ? null : item.observedCorrectPercent, coveragePercent: hidden ? null : item.coveragePercent };
    }) };
}
function response(actorId: string, result: Awaited<ReturnType<PostgresClassInsightsRepository['read']>>, workspace: ClassInsightsWorkspace, classId: string, focus?: readonly string[]): ClassInsightsResponse {
  if (result.report.classroom.id !== classId || result.report.view !== (workspace === 'admin' ? 'administrator' : 'owner')) throw new Error('Class insight response scope changed');
  const report = safeReport(result.report);
  const pool = questions();
  const selection = buildClassFollowUp(report, pool, result.assignedQuestionIds, focus);
  const chosen = selection.items.map(item => pool.find(question => question.versionId === item.questionVersionId)!).map(toLearnerQuestion);
  return { actorId, report, suggestion: {
    focusConceptIds: [...selection.focusConceptIds], questions: chosen,
    unavailableConceptIds: [...selection.unavailableConceptIds],
    reason: 'Review these suggested questions, then edit the quiz before choosing its audience and assigning it. Only released class quiz evidence informs the suggestions.',
    emptyReason: chosen.length ? null : 'No unused reviewed questions match this focus. Choose other concepts or create a quiz from the full question bank.',
  } };
}
export async function readClassInsightsRequest(request: Request, classId: string): Promise<ClassInsightsResponse> {
  const actorId = await authenticatedActor(request);
  const id = classInsightsId(classId);
  const { workspace, focus } = classInsightsQuery(request, classInsightConceptIds());
  return withClassInsights(actorId, workspace, async repository => response(actorId, await repository.read(id), workspace, id, focus));
}
export type ClassInsightsPageAccess = { status: 'authorized'; actorId: string; classroom: { id: string; name: string } }
  | { status: 'unauthenticated' | 'forbidden' | 'not_found' };
export async function readClassInsightsPage(workspace: ClassInsightsWorkspace, classId: string): Promise<ClassInsightsPageAccess> {
  try {
    const actorId = await authenticatedActor();
    const id = classInsightsId(classId);
    const classroom = await withClassInsights(actorId, workspace, repository => repository.readClassroom(id));
    if (classroom.id !== id) throw new Error('Class insight metadata scope changed');
    return { status: 'authorized', actorId, classroom: { id: classroom.id, name: classroom.name } };
  } catch (error) {
    if (error instanceof ClassInsightsApiError && error.status === 401) return { status: 'unauthenticated' };
    if (error instanceof ClassInsightsApiError && error.status === 403) return { status: 'forbidden' };
    if (error instanceof ClassInsightsAccessError || error instanceof ClassInsightsInputError) return { status: 'not_found' };
    throw error;
  }
}
/** An editable seed, never a saved draft, assignment, recipient or grade. */
export async function readClassFollowUpSeed(workspace: ClassInsightsWorkspace, classId: string, rawFocus: unknown) {
  const actorId = await authenticatedActor();
  const focus = classInsightsFocus(rawFocus, classInsightConceptIds());
  if (!focus?.length) throw new ClassInsightsInputError();
  return withClassInsights(actorId, workspace, async repository => {
    const id = classInsightsId(classId);
    const current = response(actorId, await repository.read(id), workspace, id, focus);
    return { actorId, suggestion: current.suggestion, seedKey: `focus:${focus.join(':')}` };
  });
}
export function classInsightsJson(value: unknown, status = 200) { return NextResponse.json(value, { status, headers }); }
export function classInsightsFailure(error: unknown) {
  if (error instanceof ClassInsightsApiError) return classInsightsJson({ code: error.code, error: error.message }, error.status);
  if (error instanceof ClassInsightsInputError) return classInsightsJson({ code: 'invalid_request', error: 'Choose a valid class workspace and up to three distinct concepts.' }, 400);
  if (error instanceof ClassInsightsAccessError) return classInsightsJson({ code: 'not_found', error: 'Class insights are unavailable for this request.' }, 404);
  return classInsightsJson({ code: 'insights_unavailable', error: 'Class insights are temporarily unavailable. Try again.' }, 503);
}

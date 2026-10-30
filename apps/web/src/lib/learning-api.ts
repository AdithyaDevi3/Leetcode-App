import { NextResponse } from 'next/server';
import {
  createDatabaseClient, databaseConfigFromEnv, PostgresLearningEvidenceRepository,
  LearningEvidenceAccessError, LearningEvidenceConflictError, LearningEvidenceValidationError,
  learningDecisionKey,
} from '@leetcode-app/database';
import { buildLearningDecision, type LearningEvidenceSnapshot, type LearningPracticeDescriptor } from '@leetcode-app/domain';
import { getSession } from './auth/session';
import { practiceItems } from './content';
import { toPersistedContentId } from './content-id';
import { CODE_GRADING_VERSION } from './code-grading';
import { decodeLearningReviewRequest, LearningInputError } from './learning-input';
import type { LearningApiResponse, LearningRecommendationResponse, LearningReviewResponse } from './learning-api-types';
import { decodeLearningRecommendationRequest } from './learning-recommendation-input';

const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, x-learning-owner' };

export class LearningApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

// This catalog is controlled by the application, never supplied by the learner.
export const learningPracticeCatalog: readonly LearningPracticeDescriptor[] = practiceItems.map(item => ({
  practiceId: item.id, contentId: toPersistedContentId(item.id), label: item.label,
  conceptIds: [...item.conceptIds], difficulty: item.difficulty, estimatedMinutes: item.estimatedMinutes,
}));

async function authenticatedOwner(request: Request, requireOwner: boolean): Promise<string> {
  const session = await getSession({ failOnAuthError: true });
  if (!session) throw new LearningApiError(401, 'authentication_required', 'Sign in to view account learning.');
  const expectedOwner = request.headers.get('x-learning-owner');
  if ((requireOwner || expectedOwner !== null) && expectedOwner !== session.user.id) {
    throw new LearningApiError(409, 'owner_changed', 'Your signed-in account changed. Reload your learning plan.');
  }
  return session.user.id;
}

/** Explicit allowlist prevents private source evidence from entering a learner response. */
export function learningApiResponse(learnerId: string, source: LearningEvidenceSnapshot): LearningApiResponse {
  const snapshot: LearningEvidenceSnapshot = {
    algorithmVersion: source.algorithmVersion, generatedAt: source.generatedAt, optOut: source.optOut,
    concepts: source.concepts.map(concept => ({
      conceptId: concept.conceptId, score: concept.score, confidence: concept.confidence,
      uncertainty: { lower: concept.uncertainty.lower, upper: concept.uncertainty.upper },
      evidenceStatus: concept.evidenceStatus, independentItems: concept.independentItems,
      lastEvidenceAt: concept.lastEvidenceAt, reviewDueAt: concept.reviewDueAt, reviewRevision: concept.reviewRevision,
    })),
    recentActivityIds: [...source.recentActivityIds],
    sourceSummary: { releasedQuizItems: source.sourceSummary.releasedQuizItems,
      verifiedPracticeItems: source.sourceSummary.verifiedPracticeItems, independentItems: source.sourceSummary.independentItems,
      ...(source.sourceSummary.diagnosticItems === undefined ? {} : { diagnosticItems: source.sourceSummary.diagnosticItems }) },
    processing: { pending: source.processing.pending, processedSources: source.processing.processedSources,
      remainingSources: source.processing.remainingSources },
  };
  const decision = buildLearningDecision(snapshot, learningPracticeCatalog);
  return { learnerId, snapshot, plan: decision.plan, decisionKey: snapshot.optOut ? null : learningDecisionKey(decision) };
}

export async function selectAccountRecommendation(request: Request): Promise<LearningRecommendationResponse> {
  const userId = await authenticatedOwner(request, true);
  const input = await decodeLearningRecommendationRequest(request);
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const repository = new PostgresLearningEvidenceRepository(db, { userId, practiceCatalog: learningPracticeCatalog, practiceGradeVersion: CODE_GRADING_VERSION });
    const receipt = await repository.selectRecommendation(input);
    return { learnerId: userId, receipt: {
      requestKey: receipt.requestKey, decisionKey: receipt.decisionKey, selectionId: receipt.selectionId,
      practiceId: receipt.practiceId, selectedAt: receipt.selectedAt,
    } };
  } catch (error) {
    if (error instanceof LearningEvidenceConflictError) throw new LearningApiError(409, 'recommendation_conflict', 'Your recommended practice changed. Load the latest plan before choosing again.');
    throw error;
  } finally { await db.close(); }
}

export async function readAccountLearning(request: Request): Promise<LearningApiResponse> {
  const userId = await authenticatedOwner(request, false);
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const repository = new PostgresLearningEvidenceRepository(db, { userId, practiceCatalog: learningPracticeCatalog, practiceGradeVersion: CODE_GRADING_VERSION });
    return learningApiResponse(userId, await repository.readSnapshot());
  } finally { await db.close(); }
}

export async function snoozeAccountLearning(request: Request): Promise<LearningReviewResponse> {
  const userId = await authenticatedOwner(request, true);
  const input = await decodeLearningReviewRequest(request);
  const db = createDatabaseClient(databaseConfigFromEnv());
  try {
    const repository = new PostgresLearningEvidenceRepository(db, { userId, practiceCatalog: learningPracticeCatalog, practiceGradeVersion: CODE_GRADING_VERSION });
    const result = await repository.snoozeReview(input);
    const receipt = result.receipt;
    return { ...learningApiResponse(userId, result.snapshot), reviewReceipt: {
      conceptId: receipt.conceptId, requestKey: receipt.requestKey, previousRevision: receipt.previousRevision,
      revision: receipt.revision, dueAt: receipt.dueAt,
    } };
  } finally { await db.close(); }
}

export function learningJson(value: LearningApiResponse | LearningReviewResponse | LearningRecommendationResponse) {
  return NextResponse.json(value, { headers: responseHeaders });
}

export function learningErrorResponse(error: unknown) {
  if (error instanceof LearningApiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: responseHeaders });
  if (error instanceof LearningInputError) return NextResponse.json({ error: error.message, code: 'invalid_request' }, { status: error.status, headers: responseHeaders });
  if (error instanceof LearningEvidenceAccessError) return NextResponse.json({ error: 'Account learning is unavailable for this request.', code: 'access_denied' }, { status: 403, headers: responseHeaders });
  if (error instanceof LearningEvidenceConflictError) return NextResponse.json({ error: 'Your learning review changed. Refresh before trying again.', code: 'review_conflict' }, { status: 409, headers: responseHeaders });
  if (error instanceof LearningEvidenceValidationError) return NextResponse.json({ error: 'Use a valid learning review request.', code: 'invalid_request' }, { status: 400, headers: responseHeaders });
  return NextResponse.json({ error: 'Account learning is temporarily unavailable. Please try again.', code: 'learning_unavailable' }, { status: 503, headers: responseHeaders });
}

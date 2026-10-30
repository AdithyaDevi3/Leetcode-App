import type { LearningRecommendationRequest } from './learning-api-types';
import { LearningInputError } from './learning-input';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';

export function parseLearningRecommendationRequest(value: unknown): LearningRecommendationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new LearningInputError('Use a valid practice selection.');
  const body = value as Record<string, unknown>;
  const fields = ['practiceId', 'expectedDecisionKey', 'requestKey'];
  if (Object.keys(body).length !== fields.length || Object.keys(body).some(key => !fields.includes(key))
    || typeof body.practiceId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(body.practiceId)
    || typeof body.expectedDecisionKey !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedDecisionKey)
    || typeof body.requestKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(body.requestKey)) {
    throw new LearningInputError('Use a valid practice selection.');
  }
  return { practiceId: body.practiceId, expectedDecisionKey: body.expectedDecisionKey, requestKey: body.requestKey };
}

export async function decodeLearningRecommendationRequest(request: Request): Promise<LearningRecommendationRequest> {
  try { return parseLearningRecommendationRequest(await decodeQuizRequest(request, 4_000)); }
  catch (error) {
    if (error instanceof QuizInputError) throw new LearningInputError('Use a valid practice selection.', error.status);
    throw error;
  }
}

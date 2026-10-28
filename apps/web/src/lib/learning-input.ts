import type { LearningReviewRequest } from './learning-api-types';
import { decodeQuizRequest, QuizInputError } from './quiz-assignment-input';

export class LearningInputError extends Error {
  constructor(message = 'Use a valid learning review request.', readonly status: 400 | 413 = 400) {
    super(message);
    this.name = 'LearningInputError';
  }
}

export function parseLearningReviewRequest(value: unknown): LearningReviewRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new LearningInputError();
  const body = value as Record<string, unknown>;
  const fields = ['conceptId', 'expectedRevision', 'days', 'requestKey'];
  if (Object.keys(body).length !== fields.length || Object.keys(body).some(key => !fields.includes(key))
    || typeof body.conceptId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(body.conceptId)
    || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1
    || ![1, 3, 7].includes(Number(body.days)) || typeof body.days !== 'number'
    || typeof body.requestKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(body.requestKey)) throw new LearningInputError();
  return { conceptId: body.conceptId, expectedRevision: body.expectedRevision as number,
    days: body.days as 1 | 3 | 7, requestKey: body.requestKey };
}

export async function decodeLearningReviewRequest(request: Request): Promise<LearningReviewRequest> {
  try {
    return parseLearningReviewRequest(await decodeQuizRequest(request, 4_000));
  } catch (error) {
    if (error instanceof QuizInputError) throw new LearningInputError(undefined, error.status);
    throw error;
  }
}

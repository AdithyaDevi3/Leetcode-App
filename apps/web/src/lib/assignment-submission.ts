import { GradebookAccessError, GradebookConflictError } from '@leetcode-app/database';

export type AssignmentSubmissionInput = Readonly<{
  responseRevisionId: string;
  requestKey: string;
}>;

export type AssignmentSubmissionRouteError = Readonly<{
  status: 400 | 401 | 404 | 409 | 500;
  body: Readonly<{ error: string }>;
}>;

export class AssignmentSubmissionValidationError extends Error {
  constructor() {
    super('Invalid assignment submission request.');
    this.name = 'AssignmentSubmissionValidationError';
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicFields = new Set(['responseRevisionId', 'requestKey']);

/**
 * Parses the complete public request body. Submission content and all ownership,
 * policy, and evaluation identifiers must be resolved from server-side state.
 */
export function parseAssignmentSubmissionBody(value: unknown): AssignmentSubmissionInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AssignmentSubmissionValidationError();
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== publicFields.size || keys.some((key) => !publicFields.has(key))) {
    throw new AssignmentSubmissionValidationError();
  }

  if (typeof body.responseRevisionId !== 'string' || !uuidPattern.test(body.responseRevisionId)) {
    throw new AssignmentSubmissionValidationError();
  }
  if (typeof body.requestKey !== 'string') throw new AssignmentSubmissionValidationError();

  const requestKey = body.requestKey.trim();
  if (!requestKey || requestKey.length > 128) throw new AssignmentSubmissionValidationError();

  return Object.freeze({ responseRevisionId: body.responseRevisionId, requestKey });
}

/** Maps internal failures to stable, non-sensitive HTTP response data. */
export function mapAssignmentSubmissionError(error: unknown): AssignmentSubmissionRouteError {
  if (error instanceof AssignmentSubmissionValidationError) {
    return { status: 400, body: { error: 'Invalid submission request' } };
  }
  if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
    return { status: 401, body: { error: 'Authentication required' } };
  }
  if (error instanceof GradebookAccessError) {
    return { status: 404, body: { error: 'Assignment not found' } };
  }
  if (error instanceof GradebookConflictError) {
    return { status: 409, body: { error: 'Assignment submission conflict' } };
  }
  return { status: 500, body: { error: 'Unable to submit assignment' } };
}

import { GradebookAccessError, GradebookConflictError, GradebookRateLimitError } from '@leetcode-app/database';

export type AssignmentSubmissionInput = Readonly<{
  language: 'python' | 'cpp' | 'typescript';
  source: string;
  requestKey: string;
}>;

export type AssignmentSubmissionRouteError = Readonly<{
  status: 400 | 401 | 404 | 409 | 429 | 500;
  body: Readonly<{ error: string }>;
}>;

export class AssignmentSubmissionValidationError extends Error {
  constructor() {
    super('Invalid assignment submission request.');
    this.name = 'AssignmentSubmissionValidationError';
  }
}

const publicFields = new Set(['language', 'source', 'requestKey']);
const languages = new Set(['python', 'cpp', 'typescript']);

/**
 * Parses the complete public request body. Ownership, policy, response-revision,
 * and evaluation identifiers are always resolved or generated server-side.
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

  if (typeof body.language !== 'string' || !languages.has(body.language)) throw new AssignmentSubmissionValidationError();
  if (typeof body.source !== 'string' || !body.source.trim() || new TextEncoder().encode(body.source).byteLength > 100_000) {
    throw new AssignmentSubmissionValidationError();
  }
  if (typeof body.requestKey !== 'string') throw new AssignmentSubmissionValidationError();

  const requestKey = body.requestKey.trim();
  if (!requestKey || requestKey.length > 128) throw new AssignmentSubmissionValidationError();

  return Object.freeze({ language: body.language as AssignmentSubmissionInput['language'], source: body.source, requestKey });
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
  if (error instanceof GradebookRateLimitError) {
    return { status: 429, body: { error: 'Too many assignment submissions' } };
  }
  return { status: 500, body: { error: 'Unable to submit assignment' } };
}

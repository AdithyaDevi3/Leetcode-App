import { GradebookAccessError, GradebookConflictError } from '@leetcode-app/database';

export class LearnerGradeDisputeValidationError extends Error {
  constructor() {
    super('Invalid grade dispute request.');
    this.name = 'LearnerGradeDisputeValidationError';
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactBody(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LearnerGradeDisputeValidationError();
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new LearnerGradeDisputeValidationError();
  return body;
}

function requiredString(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new LearnerGradeDisputeValidationError();
  const result = value.trim();
  if (!result || result.length > maximum) throw new LearnerGradeDisputeValidationError();
  return result;
}

function requiredUuid(value: unknown): string {
  const result = requiredString(value, 36);
  if (!uuidPattern.test(result)) throw new LearnerGradeDisputeValidationError();
  return result;
}

function optionalUuid(value: unknown): string | null {
  return value === null ? null : requiredUuid(value);
}

export function parseOpenGradeDisputeBody(value: unknown) {
  const body = exactBody(value, ['expectedDisputeEventId', 'gradeRevisionId', 'reason', 'requestKey']);
  const reason = requiredString(body.reason, 4000);
  if (reason.length < 20) throw new LearnerGradeDisputeValidationError();
  return Object.freeze({
    expectedDisputeEventId: optionalUuid(body.expectedDisputeEventId),
    gradeRevisionId: requiredUuid(body.gradeRevisionId),
    reason,
    requestKey: requiredString(body.requestKey, 128),
  });
}

export function parseWithdrawGradeDisputeBody(value: unknown) {
  const body = exactBody(value, ['expectedDisputeEventId', 'requestKey']);
  return Object.freeze({
    expectedDisputeEventId: requiredUuid(body.expectedDisputeEventId),
    requestKey: requiredString(body.requestKey, 128),
  });
}

export function learnerGradeDisputeError(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof LearnerGradeDisputeValidationError || error instanceof SyntaxError) {
    return { status: 400, body: { error: 'Invalid grade dispute request' } };
  }
  if (error instanceof Error && error.message === 'Unauthorized: Authentication required') {
    return { status: 401, body: { error: 'Authentication required' } };
  }
  if (error instanceof GradebookAccessError) return { status: 404, body: { error: 'Assignment not found' } };
  if (error instanceof GradebookConflictError) return { status: 409, body: { error: 'Grade dispute changed; refresh and try again' } };
  return { status: 500, body: { error: 'Unable to update the grade dispute' } };
}

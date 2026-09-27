import { GradebookAccessError, GradebookConflictError } from '@leetcode-app/database';
import { describe, expect, it } from 'vitest';
import {
  AssignmentSubmissionValidationError,
  mapAssignmentSubmissionError,
  parseAssignmentSubmissionBody,
} from './assignment-submission';

const responseRevisionId = '11111111-1111-4111-8111-111111111111';

describe('assignment submission input', () => {
  it('accepts only an exact response revision and bounded idempotency key', () => {
    expect(parseAssignmentSubmissionBody({
      responseRevisionId,
      requestKey: '  assignment-attempt-1  ',
    })).toEqual({ responseRevisionId, requestKey: 'assignment-attempt-1' });
  });

  it.each([
    null,
    [],
    {},
    { responseRevisionId, requestKey: '' },
    { responseRevisionId, requestKey: ' '.repeat(20) },
    { responseRevisionId, requestKey: 'x'.repeat(129) },
    { responseRevisionId: 'not-a-uuid', requestKey: 'attempt-1' },
    { responseRevisionId, requestKey: 1 },
  ])('rejects malformed public bodies: %j', (body) => {
    expect(() => parseAssignmentSubmissionBody(body)).toThrow(AssignmentSubmissionValidationError);
  });

  it.each(['learnerId', 'recipientId', 'policyVersionId', 'assignmentId', 'source', 'code', 'language', 'testIds'])(
    'rejects the server-owned or submission-content field %s',
    (field) => {
      expect(() => parseAssignmentSubmissionBody({
        responseRevisionId,
        requestKey: 'attempt-1',
        [field]: 'forged',
      })).toThrow(AssignmentSubmissionValidationError);
    },
  );
});

describe('assignment submission route error mapping', () => {
  it.each([
    [new AssignmentSubmissionValidationError(), 400, 'Invalid submission request'],
    [new Error('Unauthorized: Authentication required'), 401, 'Authentication required'],
    [new GradebookAccessError(), 404, 'Assignment not found'],
    [new GradebookConflictError(), 409, 'Assignment submission conflict'],
    [new Error('database connection included a secret'), 500, 'Unable to submit assignment'],
    ['unexpected rejection', 500, 'Unable to submit assignment'],
  ] as const)('maps failures without exposing their internal message', (error, status, message) => {
    expect(mapAssignmentSubmissionError(error)).toEqual({ status, body: { error: message } });
  });
});

import { GradebookAccessError, GradebookConflictError, GradebookRateLimitError } from '@leetcode-app/database';
import { describe, expect, it } from 'vitest';
import {
  AssignmentSubmissionValidationError,
  mapAssignmentSubmissionError,
  parseAssignmentSubmissionBody,
} from './assignment-submission';

describe('assignment submission input', () => {
  it('accepts only supported source and a bounded idempotency key', () => {
    expect(parseAssignmentSubmissionBody({
      language: 'python',
      source: 'def solve():\n    return 1',
      requestKey: '  assignment-attempt-1  ',
    })).toEqual({ language: 'python', source: 'def solve():\n    return 1', requestKey: 'assignment-attempt-1' });
  });

  it.each([
    null,
    [],
    {},
    { language: 'ruby', source: 'puts 1', requestKey: 'attempt-1' },
    { language: 'python', source: '', requestKey: 'attempt-1' },
    { language: 'python', source: '界'.repeat(34_000), requestKey: 'attempt-1' },
    { language: 'python', source: 'print(1)', requestKey: '' },
    { language: 'python', source: 'print(1)', requestKey: ' '.repeat(20) },
    { language: 'python', source: 'print(1)', requestKey: 'x'.repeat(129) },
    { language: 'python', source: 'print(1)', requestKey: 1 },
  ])('rejects malformed public bodies: %j', (body) => {
    expect(() => parseAssignmentSubmissionBody(body)).toThrow(AssignmentSubmissionValidationError);
  });

  it.each(['learnerId', 'recipientId', 'policyVersionId', 'assignmentId', 'responseRevisionId', 'code', 'testIds'])(
    'rejects the server-owned or submission-content field %s',
    (field) => {
      expect(() => parseAssignmentSubmissionBody({
        language: 'python',
        source: 'print(1)',
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
    [new GradebookRateLimitError(), 429, 'Too many assignment submissions'],
    [new Error('database connection included a secret'), 500, 'Unable to submit assignment'],
    ['unexpected rejection', 500, 'Unable to submit assignment'],
  ] as const)('maps failures without exposing their internal message', (error, status, message) => {
    expect(mapAssignmentSubmissionError(error)).toEqual({ status, body: { error: message } });
  });
});

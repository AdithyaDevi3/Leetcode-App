import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import {
  interviewCore250ExerciseCatalog,
  interviewCore250QuestionCandidates,
  validateInterviewCore250QuestionCandidates,
} from './questions-index';

describe('interview core question index', () => {
  it('indexes every current unpublished batch without duplicate IDs', () => {
    expect(interviewCore250QuestionCandidates).toHaveLength(250);
    expect(validateInterviewCore250QuestionCandidates()).toEqual(interviewCore250QuestionCandidates);
    expect(interviewCore250ExerciseCatalog).toHaveLength(250);
  });

  it('rejects duplicated or released candidates', () => {
    expect(() => validateInterviewCore250QuestionCandidates([interviewCore250QuestionCandidates[0], interviewCore250QuestionCandidates[0]])).toThrow('unique');
    expect(() => validateInterviewCore250QuestionCandidates([{ ...interviewCore250QuestionCandidates[0], status: 'reviewed' }])).toThrow('review-gated');
  });
});

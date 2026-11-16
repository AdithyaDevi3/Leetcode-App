import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { interviewCore250QuestionCandidates } from './questions-index';
import { reviewInterviewCore250Candidate } from './review.server';

describe('Interview Core 250 review adapter', () => {
  const candidate = interviewCore250QuestionCandidates[0];
  const review = {
    reviewerId: 'independent-curriculum-reviewer',
    reviewedAt: '2026-11-16T20:00:00.000Z',
    notes: 'Reviewed for clarity, answer validity, and original wording.',
  };

  it('returns a reviewed immutable version for an independent reviewer', () => {
    const result = reviewInterviewCore250Candidate({ questionId: candidate.questionId, review });
    expect(result).toMatchObject({ questionId: candidate.questionId, status: 'reviewed', review });
    expect(result).not.toBe(candidate);
  });

  it('rejects a missing question and self-review', () => {
    expect(() => reviewInterviewCore250Candidate({ questionId: 'missing-curriculum-question', review })).toThrow('does not exist');
    expect(() => reviewInterviewCore250Candidate({
      questionId: candidate.questionId,
      review: { ...review, reviewerId: candidate.provenance.authorId },
    })).toThrow('independently');
  });
});

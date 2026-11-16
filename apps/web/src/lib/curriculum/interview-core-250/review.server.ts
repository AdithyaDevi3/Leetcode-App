import 'server-only';

import {
  reviewQuestionVersion,
  type QuestionReview,
  type QuestionVersion,
} from '@leetcode-app/domain';
import { interviewCore250QuestionCandidates } from './questions-index';

export type InterviewCore250ReviewCommand = Readonly<{
  questionId: string;
  review: QuestionReview;
}>;

/**
 * Apply one independent review to an immutable curriculum candidate.
 * A future persistence layer must store the returned version before publication.
 */
export function reviewInterviewCore250Candidate(
  command: InterviewCore250ReviewCommand,
  candidates: readonly QuestionVersion[] = interviewCore250QuestionCandidates,
): QuestionVersion {
  const candidate = candidates.find(question => question.questionId === command.questionId);
  if (!candidate) throw new Error('The curriculum question does not exist.');
  return reviewQuestionVersion(candidate, command.review);
}

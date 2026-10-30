import 'server-only';
import { reviewQuestionVersion, type QuestionVersion } from '@leetcode-app/domain';
import { diagnosticQuestionCandidates } from './diagnostic-question-bank.server';
import { diagnosticQuestionReviews } from './diagnostic-question-review.server';

const reviewedQuestions: readonly QuestionVersion[] = Object.freeze(diagnosticQuestionCandidates.flatMap(question => {
  const review = diagnosticQuestionReviews[question.versionId];
  return review ? [reviewQuestionVersion(question, review)] : [];
}));

/** Server-only practice pool; never use the assignable bank for diagnostic feedback. */
export function getDiagnosticQuestionVersions(): readonly QuestionVersion[] { return reviewedQuestions; }

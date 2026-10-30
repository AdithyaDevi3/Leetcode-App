import { describe, expect, it, vi } from 'vitest';
import { buildDiagnosticSnapshot, scoreMultipleChoiceQuiz, toLearnerQuestion } from '@leetcode-app/domain';
import { practiceItems } from './content';

vi.mock('server-only', () => ({}));
import { getDiagnosticQuestionVersions } from './diagnostic-catalog.server';
import { diagnosticQuestionCandidates } from './diagnostic-question-bank.server';
import { diagnosticQuestionReviews } from './diagnostic-question-review.server';
import { getReviewedQuestionVersions } from './question-bank.server';
import { expandedQuestionBankCandidates } from './question-bank-expansion.server';
import { expandedQuestionBankReviews } from './question-bank-expansion-review.server';

describe('dedicated diagnostic content', () => {
  it('approves only explicitly reviewed versions and preserves unapproved authored candidates', () => {
    expect(Object.keys(expandedQuestionBankReviews).sort()).toEqual(expandedQuestionBankCandidates.map(q => q.versionId).sort());
    expect(Object.keys(diagnosticQuestionReviews).sort()).toEqual(diagnosticQuestionCandidates.map(q => q.versionId).sort());
    expect(diagnosticQuestionCandidates.every(q => q.status === 'in_review' && q.review === null)).toBe(true);
    for (const question of getDiagnosticQuestionVersions()) {
      expect(question.status).toBe('reviewed');
      expect(question.review?.reviewerId).toBe('automated-curriculum-review-v2');
      expect(question.review?.reviewerId).not.toBe(question.provenance.authorId);
      expect(question.review?.notes).toContain('Independent automated content review');
      expect(question.review?.notes).toContain('Teacher validation remains pending');
      expect(question.review!.reviewedAt >= question.provenance.authoredAt).toBe(true);
    }
  });

  it('covers all ten activities once with separate nonadvanced questions, without class-quiz answer reuse', () => {
    const diagnostic = getDiagnosticQuestionVersions();
    const assignable = getReviewedQuestionVersions();
    expect(diagnostic).toHaveLength(10);
    expect(new Set(diagnostic.map(q => q.questionId)).size).toBe(10);
    expect(new Set(diagnostic.map(q => q.versionId)).size).toBe(10);
    for (const activity of practiceItems) {
      const matches = diagnostic.filter(q => q.activityIds.includes(activity.id));
      expect(matches).toHaveLength(1);
      expect(matches[0].activityIds).toEqual([activity.id]);
      expect(matches[0].difficulty).not.toBe('advanced');
      expect(matches[0].conceptIds.every(id => activity.conceptIds.includes(id))).toBe(true);
    }
    for (const question of diagnostic) {
      expect(assignable.some(q => q.questionId === question.questionId || q.versionId === question.versionId)).toBe(false);
      expect(assignable.some(q => q.prompt === question.prompt)).toBe(false);
      const preview = toLearnerQuestion(question);
      expect(Object.keys(preview).sort()).toEqual(['activityIds', 'conceptIds', 'difficulty', 'kind', 'options', 'prompt', 'questionId', 'title', 'version', 'versionId']);
      expect(preview.options.every(option => Object.keys(option).sort().join(',') === 'id,text')).toBe(true);
    }
  });

  it('pins the balanced pool for scoring and treats skipped questions as unanswered without misconception clues', () => {
    const snapshot = buildDiagnosticSnapshot(getDiagnosticQuestionVersions(), practiceItems.map(item => item.id));
    expect(snapshot.questions).toHaveLength(10);
    expect(snapshot.maxUnits).toBe(1000);
    const selected = snapshot.questions[0].question;
    const result = scoreMultipleChoiceQuiz(JSON.parse(JSON.stringify(snapshot)), { [selected.versionId]: selected.correctOptionId });
    expect(result).toMatchObject({ correctCount: 1, answeredCount: 1, earnedUnits: 100, totalQuestions: 10 });
    expect(result.items.slice(1).every(item => item.selectedOptionId === null && item.misconceptionTags.length === 0)).toBe(true);
    expect(Object.isFrozen(snapshot.questions[0].question)).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { freezeQuizQuestionSelection, reviewQuestionVersion, scoreMultipleChoiceQuiz, toLearnerQuestion } from '@leetcode-app/domain';
import { practiceItems } from './content';

vi.mock('server-only', () => ({}));
import { getQuestionBankCandidates, getReviewedQuestionVersion, getReviewedQuestionVersions } from './question-bank.server';

describe('original assignable question bank', () => {
  it('provides sixty distinct versioned candidates, covering every existing coding activity six times', () => {
    const candidates = getQuestionBankCandidates();
    expect(candidates).toHaveLength(60);
    expect(new Set(candidates.map(question => question.questionId)).size).toBe(60);
    expect(new Set(candidates.map(question => question.versionId)).size).toBe(60);
    expect(candidates.filter(question => question.provenance.authorId === 'automated-curriculum-author-v1')).toHaveLength(20);
    expect(candidates.filter(question => question.provenance.authorId === 'automated-curriculum-author-v2')).toHaveLength(40);
    for (const activity of practiceItems) expect(candidates.filter(question => question.activityIds.includes(activity.id))).toHaveLength(6);
    for (const question of candidates) {
      expect(question.status).toBe('in_review');
      expect(question.provenance.kind).toBe('original');
      expect(question.review).toBeNull();
      expect(question.options.filter(option => option.id === question.correctOptionId)).toHaveLength(1);
      expect(question.options.find(option => option.id === question.correctOptionId)?.misconceptionTags).toEqual([]);
      expect(Object.isFrozen(question.options)).toBe(true);
    }
  });

  it('keeps lookup restricted to independently reviewed versions and rejects stale IDs', () => {
    expect(getReviewedQuestionVersions()).toHaveLength(60);
    for (const question of getReviewedQuestionVersions()) {
      expect(question.status).toBe('reviewed');
      expect(question.review?.reviewerId).not.toBe(question.provenance.authorId);
      expect(question.review?.notes).toContain('automated');
      expect(question.review?.notes).toContain('Teacher validation remains pending');
      expect(question.review!.reviewedAt >= question.provenance.authoredAt).toBe(true);
      expect(getReviewedQuestionVersion(question.versionId)).toEqual(question);
    }
    expect(getReviewedQuestionVersion('pair-distinct-indices@999')).toBeNull();
    expect(getReviewedQuestionVersion('not-in-the-bank@1')).toBeNull();
  });

  it('never emits answer keys, explanations, review attribution, or misconception clues in learner previews', () => {
    for (const question of getQuestionBankCandidates()) {
      const preview = toLearnerQuestion(question);
      expect(Object.keys(preview.options[0]).sort()).toEqual(['id', 'text']);
      const publicJson = JSON.stringify(preview);
      for (const secretField of ['correctOptionId', 'misconceptionTags', 'explanation', 'provenance', 'reviewerId']) expect(publicJson).not.toContain(secretField);
    }
  });

  it('round-trips pinned content through storage JSON and deterministic scoring independently of catalog edits', () => {
    const original = getQuestionBankCandidates()[0];
    const reviewed = reviewQuestionVersion(original, { reviewerId: 'scoring-fixture-reviewer', reviewedAt: '2026-10-26T23:00:00.000Z', notes: 'Test fixture only; does not approve the production catalog.' });
    const snapshot = freezeQuizQuestionSelection([{ question: reviewed, maxUnits: 125 }]);
    const persisted = JSON.parse(JSON.stringify(snapshot));
    expect(scoreMultipleChoiceQuiz(persisted, { [reviewed.versionId]: reviewed.correctOptionId })).toMatchObject({ earnedUnits: 125, maxUnits: 125, correctCount: 1 });
    expect(original.status).toBe('in_review');
  });
});

import { describe, expect, it } from 'vitest';
import {
  freezeQuestionVersion, freezeQuizQuestionSelection, questionVersionKey, reviewQuestionVersion,
  retireQuestionVersion, scoreMultipleChoiceQuiz, submitQuestionForReview, toLearnerQuestion,
  freezeMultipleChoiceAnswers, type QuestionVersion,
} from './question-bank';

const authoredAt = '2026-10-26T10:00:00.000Z';
const review = { reviewerId: 'independent-automated-review', reviewedAt: '2026-10-26T11:00:00.000Z', notes: 'Automated review; teacher validation pending.' };
function input() {
  return {
    questionId: 'pair-distinct-indices', version: 1, versionId: 'pair-distinct-indices@1', kind: 'multiple_choice', status: 'draft',
    title: 'Keep indices distinct', prompt: 'Which map operation happens first?', difficulty: 'foundation',
    activityIds: ['pair-with-target-v1'], conceptIds: ['hash-maps'],
    options: [{ id: 'lookup', text: 'Look up the complement.', misconceptionTags: [] as string[] },
      { id: 'insert', text: 'Insert the current value.', misconceptionTags: ['self-matching-index'] }],
    correctOptionId: 'lookup', explanation: 'Only earlier indices should already be in the map.',
    provenance: { kind: 'original', authorId: 'automated-author', authoredAt }, review: null,
  };
}
function reviewed(overrides: Partial<QuestionVersion> = {}): QuestionVersion {
  return reviewQuestionVersion(submitQuestionForReview(freezeQuestionVersion({ ...input(), ...overrides })), review);
}

it('canonicalizes saved choices in pinned order with explicit blanks and rejects foreign option or question keys', () => {
  const snapshot = freezeQuizQuestionSelection([{ question: reviewed(), maxUnits: 125 }]);
  const answers = freezeMultipleChoiceAnswers(snapshot, {});
  expect(answers).toEqual({ 'pair-distinct-indices@1': null });
  expect(Object.isFrozen(answers)).toBe(true);
  expect(scoreMultipleChoiceQuiz(snapshot, answers).earnedUnits).toBe(0);
  expect(freezeMultipleChoiceAnswers(snapshot, { 'pair-distinct-indices@1': 'lookup' })).toEqual({ 'pair-distinct-indices@1': 'lookup' });
  expect(() => freezeMultipleChoiceAnswers(snapshot, { 'pair-distinct-indices@1': 'foreign' })).toThrow('unknown option');
  expect(() => freezeMultipleChoiceAnswers(snapshot, { 'pair-distinct-indices@2': 'lookup' })).toThrow('unassigned');
  expect(() => freezeMultipleChoiceAnswers(snapshot, { 'pair-distinct-indices@1': { correctOptionId: 'lookup' } })).toThrow();
});

describe('versioned question validation and review', () => {
  it('validates identities and isolates a deeply frozen version from later author edits', () => {
    const draft = input();
    const question = freezeQuestionVersion(draft);
    draft.options[0].text = 'Changed after snapshot.';
    draft.conceptIds.push('unrelated-concept');
    expect(question.options[0].text).toBe('Look up the complement.');
    expect(question.conceptIds).toEqual(['hash-maps']);
    expect(Object.isFrozen(question)).toBe(true);
    expect(Object.isFrozen(question.options[1].misconceptionTags)).toBe(true);
    expect(Object.isFrozen(question.provenance)).toBe(true);
    expect(questionVersionKey('pair-distinct-indices', 2)).toBe('pair-distinct-indices@2');
  });

  it('requires independently attributed review and valid lifecycle transitions', () => {
    const draft = freezeQuestionVersion(input());
    expect(() => reviewQuestionVersion(draft, review)).toThrow('submitted');
    const pending = submitQuestionForReview(draft);
    expect(() => reviewQuestionVersion(pending, { ...review, reviewerId: draft.provenance.authorId })).toThrow('independently');
    expect(() => reviewQuestionVersion(pending, { ...review, reviewedAt: '2026-10-25T00:00:00.000Z' })).toThrow('after authorship');
    const accepted = reviewQuestionVersion(pending, review);
    expect(accepted.status).toBe('reviewed');
    expect(retireQuestionVersion(accepted).status).toBe('retired');
    expect(draft.status).toBe('draft');
    expect(pending.review).toBeNull();
    expect(() => submitQuestionForReview(accepted)).toThrow('drafts');
    expect(() => retireQuestionVersion(pending)).toThrow('reviewed');
    expect(() => freezeQuestionVersion({ ...input(), status: 'reviewed' })).toThrow('completed review');
  });

  it('rejects extra fields, stale identities, malformed versions, and unsafe labels', () => {
    for (const mutation of [
      { grade: 100 }, { versionId: 'pair-distinct-indices@2' }, { version: 0 }, { version: 1.5 }, { version: 1_000_000 },
      { questionId: 'Unbounded ID' }, { questionId: '1-pair' }, { questionId: 'p' }, { title: '' }, { prompt: 'x'.repeat(6_001) }, { difficulty: 'expert' },
      { provenance: { ...input().provenance, url: 'not-an-approved-provenance-field' } },
      { provenance: { ...input().provenance, authoredAt: 'not-a-date' } },
      { conceptIds: ['hash-maps', 'hash-maps'] }, { activityIds: [] }, { correctOptionId: 'missing-option' },
    ]) expect(() => freezeQuestionVersion({ ...input(), ...mutation })).toThrow();
    expect(() => freezeQuestionVersion([])).toThrow();
  });

  it('rejects duplicate/ambiguous options and misconception tags on a correct answer', () => {
    const draft = input();
    for (const options of [
      [draft.options[0]],
      [draft.options[0], { ...draft.options[1], id: draft.options[0].id }],
      [draft.options[0], { ...draft.options[1], text: draft.options[0].text.toUpperCase() }],
      [{ ...draft.options[0], misconceptionTags: ['unwarranted-correct-tag'] }, draft.options[1]],
      [draft.options[0], { ...draft.options[1], misconceptionTags: [] }],
      [draft.options[0], { ...draft.options[1], isCorrect: false }],
    ]) expect(() => freezeQuestionVersion({ ...draft, options })).toThrow();
  });

  it('projects only learner-visible fields without answer, explanation, review identity, or revealing distractor tags', () => {
    const question = reviewed();
    const projected = toLearnerQuestion(question);
    expect(Object.keys(projected).sort()).toEqual(['activityIds', 'conceptIds', 'difficulty', 'kind', 'options', 'prompt', 'questionId', 'title', 'version', 'versionId'].sort());
    expect(projected.options).toEqual([{ id: 'lookup', text: 'Look up the complement.' }, { id: 'insert', text: 'Insert the current value.' }]);
    const serialized = JSON.stringify(projected);
    for (const privateValue of ['correctOptionId', 'explanation', 'misconceptionTags', 'self-matching-index', 'automated-author', review.reviewerId]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});

describe('pinned multiple-choice snapshots and integer scoring', () => {
  it('scores exact integer units, tracks wrong-choice misconceptions, and treats missing/null answers as unanswered', () => {
    const one = reviewed();
    const two = reviewed({ questionId: 'other-reasoning', versionId: 'other-reasoning@1' });
    const three = reviewed({ questionId: 'third-reasoning', versionId: 'third-reasoning@1' });
    const four = reviewed({ questionId: 'fourth-reasoning', versionId: 'fourth-reasoning@1' });
    const snapshot = freezeQuizQuestionSelection([{ question: one, maxUnits: 125 }, { question: two, maxUnits: 250 }, { question: three, maxUnits: 375 }, { question: four, maxUnits: 100 }]);
    const result = scoreMultipleChoiceQuiz(snapshot, { [one.versionId]: 'lookup', [two.versionId]: 'insert', [three.versionId]: null });
    expect(result).toMatchObject({ earnedUnits: 125, maxUnits: 850, answeredCount: 2, correctCount: 1, totalQuestions: 4 });
    expect(result.items[1]).toMatchObject({ correct: false, earnedUnits: 0, misconceptionTags: ['self-matching-index'] });
    expect(result.items[2]).toMatchObject({ selectedOptionId: null, correct: false, misconceptionTags: [] });
    expect(result.items[3].selectedOptionId).toBeNull();
    expect(Object.isFrozen(snapshot.questions[0].question)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('correctOptionId');
  });

  it('rejects unreviewed, retired, duplicate, or overlarge selections without coercing point inputs', () => {
    const one = reviewed();
    const revised = { ...one, version: 2, versionId: 'pair-distinct-indices@2' };
    const draft = freezeQuestionVersion(input());
    for (const selection of [
      [], [{ question: draft, maxUnits: 100 }], [{ question: retireQuestionVersion(one), maxUnits: 100 }],
      [{ question: one, maxUnits: 100 }, { question: one, maxUnits: 100 }],
      [{ question: one, maxUnits: 100 }, { question: revised, maxUnits: 100 }],
      [{ question: one, maxUnits: 0 }], [{ question: one, maxUnits: 0.5 }], [{ question: one, maxUnits: 1_000_001 }],
      [{ question: one, maxUnits: Number.MAX_SAFE_INTEGER }], [{ question: one, maxUnits: Infinity }],
      [{ question: one, maxUnits: 100, extra: 'ignored-by-unsafe-validation' }],
    ]) expect(() => freezeQuizQuestionSelection(selection)).toThrow();
    const distinct = Array.from({ length: 31 }, (_, index) => ({ question: reviewed({ questionId: `question-${index}`, versionId: `question-${index}@1` }), maxUnits: 1 }));
    expect(() => freezeQuizQuestionSelection(distinct)).toThrow('thirty');
    expect(() => freezeQuizQuestionSelection(distinct.slice(0, 2).map(selection => ({ ...selection, maxUnits: 600_000 })))).toThrow('maximum');
  });

  it('fails closed on unknown question versions, unrecognized options, multiple choices, or changed scoring metadata', () => {
    const question = reviewed();
    const snapshot = freezeQuizQuestionSelection([{ question, maxUnits: 100 }]);
    for (const answers of [
      { 'pair-distinct-indices@2': 'lookup' }, { 'not-assigned@1': 'lookup' },
      { [question.versionId]: 'missing-option' }, { [question.versionId]: ['lookup', 'insert'] },
      [{ questionVersionId: question.versionId, optionId: 'lookup' }, { questionVersionId: question.versionId, optionId: 'lookup' }],
      { [question.versionId]: 0 }, { [question.versionId]: '' }, null,
    ]) expect(() => scoreMultipleChoiceQuiz(snapshot, answers)).toThrow();
    expect(() => scoreMultipleChoiceQuiz({ ...snapshot, maxUnits: 101 }, {})).toThrow('mismatch');
    expect(() => scoreMultipleChoiceQuiz({ ...snapshot, scoringVersion: 'other-scoring' as typeof snapshot.scoringVersion }, {})).toThrow('mismatch');
    expect(scoreMultipleChoiceQuiz(snapshot, {}).earnedUnits).toBe(0);
  });
});

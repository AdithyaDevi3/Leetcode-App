import { describe, expect, it } from 'vitest';
import { buildClassFollowUp, buildClassInsights, selectClassFollowUpFocus, type ClassInsightObservation, type ClassInsightsReport } from '../src/class-insights.js';
import { freezeQuestionVersion } from '../src/question-bank.js';

const observation = (learnerId: string, questionId: string, correct: boolean | null, extra: Partial<ClassInsightObservation> = {}): ClassInsightObservation => ({
  learnerId, questionId, correct, conceptIds: ['hash-maps'], occurredAt: '2026-10-30T10:00:00.000000Z', sourceId: `${learnerId}-${questionId}`, ...extra,
});
const report = (observations: ClassInsightObservation[] = [], extra: Partial<Parameters<typeof buildClassInsights>[0]> = {}): ClassInsightsReport => buildClassInsights({
  classroom: { id: 'synthetic-class', name: 'Synthetic class' }, generatedAt: '2026-10-30T11:00:00.000Z', view: 'owner', rosterCount: 8,
  conceptIds: ['hash-maps', 'recurrence', 'trees'], observations, ...extra,
});
const item = (id: string, conceptIds = ['hash-maps'], extra = {}) => freezeQuestionVersion({
  questionId: id, version: 1, versionId: `${id}@1`, kind: 'multiple_choice', status: 'reviewed', title: `Synthetic ${id}`,
  prompt: 'Choose the invariant.', difficulty: 'foundation', activityIds: ['synthetic-activity'], conceptIds,
  options: [{ id: 'yes', text: 'Preserved.', misconceptionTags: [] }, { id: 'no', text: 'Broken.', misconceptionTags: ['synthetic-error'] }],
  correctOptionId: 'yes', explanation: 'Synthetic explanation.', provenance: { kind: 'original', authorId: 'synthetic-author', authoredAt: '2026-10-29T10:00:00.000Z' },
  review: { reviewerId: 'synthetic-reviewer', reviewedAt: '2026-10-29T11:00:00.000Z', notes: 'Synthetic independent review.' }, ...extra,
});

describe('class assessment concept aggregates', () => {
  it('enumerates the configured curriculum with no inferred weakness from absent or skipped answers', () => {
    const result = report([observation('one', 'item-one', null), observation('two', 'item-two', true, { conceptIds: ['unconfigured-secret'] })]);
    expect(result.concepts.map(item => item.conceptId)).toEqual(['hash-maps', 'recurrence', 'trees']);
    expect(result.concepts.every(item => item.coverageStatus === 'unknown' && item.answeredItems === 0 && item.observedCorrectPercent === null)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/learnerId|questionId|sourceId|unconfigured-secret/);
  });

  it('replaces repeated logical questions and ignores later skips without manufacturing coverage', () => {
    const result = report([
      observation('one', 'same-item', false),
      observation('one', 'same-item', true, { occurredAt: '2026-10-30T10:01:00.000Z', sourceId: 'later' }),
      observation('one', 'same-item', null, { occurredAt: '2026-10-30T10:02:00.000Z', sourceId: 'skipped' }),
      observation('two', 'same-item', false),
    ]).concepts[0];
    expect(result).toMatchObject({ answeredItems: 2, correctItems: 1, coveredLearners: 2, distinctQuestions: 1, observedCorrectPercent: 50, coveragePercent: 25, coverageStatus: 'limited' });
  });

  it('preserves microseconds when deciding which answered version is latest', () => {
    const result = report([
      observation('one', 'same-item', true, { occurredAt: '2026-10-30T10:00:00.000800Z', sourceId: 'a' }),
      observation('one', 'same-item', false, { occurredAt: '2026-10-30T10:00:00.000600Z', sourceId: 'z' }),
      observation('one', 'same-item', false, { occurredAt: '2026-10-30 10:00:00.999999+00', sourceId: 'invalid-noncanonical' }),
    ]).concepts[0];
    expect(result.correctItems).toBe(1); expect(result.answeredItems).toBe(1);
  });

  it('distinguishes broader observed coverage from a proficiency claim', () => {
    const observations = ['one', 'two', 'three'].flatMap(learner => ['item-one', 'item-two', 'item-three'].map((question, index) => observation(learner, question, index === 0)));
    expect(report(observations).concepts[0]).toMatchObject({ coverageStatus: 'covered', answeredItems: 9, correctItems: 3, coveredLearners: 3, distinctQuestions: 3, observedCorrectPercent: 33 });
    expect(report(observations).concepts[0]).not.toHaveProperty('mastery');
  });

  it('suppresses every administrative numeric field for cohorts below five answered learners', () => {
    for (const size of [1, 2, 3, 4]) {
      const result = report(Array.from({ length: size }, (_, index) => observation(`learner-${index}`, 'item-one', index === 0)), { view: 'administrator' });
      expect(result.concepts[0]).toEqual({ conceptId: 'hash-maps', coverageStatus: 'suppressed', answeredItems: null, correctItems: null, coveredLearners: null, distinctQuestions: null, observedCorrectPercent: null, coveragePercent: null });
      expect(Object.keys(result).sort()).toEqual(['adminMinimumLearners', 'algorithmVersion', 'classroom', 'concepts', 'generatedAt', 'rosterCount', 'view']);
    }
    expect(report([], { view: 'administrator' }).concepts[0]).toMatchObject({ coverageStatus: 'unknown', answeredItems: null, correctItems: null });
    const five = report(Array.from({ length: 5 }, (_, index) => observation(`learner-${index}`, 'item-one', index === 0)), { view: 'administrator' }).concepts[0];
    expect(five).toMatchObject({ coverageStatus: 'limited', coveredLearners: 5, answeredItems: 5, correctItems: 1, observedCorrectPercent: 20 });
  });

  it('does not use hidden administrative scores to order or default follow-up concepts', () => {
    const lower = report([observation('one', 'item-one', false)], { view: 'administrator' });
    const higher = report([observation('one', 'item-one', true)], { view: 'administrator' });
    expect(lower).toEqual(higher); expect(selectClassFollowUpFocus(lower)).toEqual(['hash-maps', 'recurrence', 'trees']);
  });
});

describe('editable fresh class follow-up selection', () => {
  it('prioritizes adequately covered review needs, while sparse data only supports coverage suggestions', () => {
    const result = report(['one', 'two', 'three'].flatMap(learner => ['item-one', 'item-two', 'item-three'].map(question => observation(learner, question, false, { conceptIds: ['trees'] }))));
    expect(selectClassFollowUpFocus(result)[0]).toBe('trees');
    const selection = buildClassFollowUp(result, [item('fresh-tree', ['trees']), item('fresh-hash')], [], ['trees', 'hash-maps']);
    expect(selection.items.find(item => item.questionVersionId === 'fresh-tree@1')?.reason).toBe('review');
    expect(selection.items.find(item => item.questionVersionId === 'fresh-hash@1')?.reason).toBe('coverage');
  });

  it('excludes every already assigned logical question, advanced and unreviewed candidates, and keeps the latest fresh version', () => {
    const selection = buildClassFollowUp(report(), [item('seen'), item('fresh'), item('fresh', ['hash-maps'], { version: 2, versionId: 'fresh@2' }), item('advanced', ['hash-maps'], { difficulty: 'advanced' }), item('draft', ['hash-maps'], { status: 'draft', review: null })], ['seen'], ['hash-maps']);
    expect(selection.items).toEqual([{ questionVersionId: 'fresh@2', maxUnits: 500, conceptIds: ['hash-maps'], reason: 'coverage' }]);
    expect(JSON.stringify(selection)).not.toMatch(/correctOptionId|explanation|options|provenance/);
  });

  it('bounds suggestions and states which chosen concepts have no fresh reviewed item', () => {
    const questions = Array.from({ length: 12 }, (_, index) => item(`fresh-${index}`, [index % 2 ? 'hash-maps' : 'recurrence']));
    const selection = buildClassFollowUp(report(), questions, [], ['hash-maps', 'recurrence', 'trees']);
    expect(selection.items.length).toBeLessThanOrEqual(6); expect(new Set(selection.items.map(item => item.questionVersionId)).size).toBe(selection.items.length);
    expect(selection.unavailableConceptIds).toEqual(['trees']);
    expect(buildClassFollowUp(report(), [item('seen')], ['seen'], ['hash-maps']).items).toEqual([]);
    expect(() => buildClassFollowUp(report(), questions, [], ['unknown'])).toThrow();
    expect(() => buildClassFollowUp(report(), questions, [], ['hash-maps', 'recurrence', 'trees', 'extra'])).toThrow();
  });
});

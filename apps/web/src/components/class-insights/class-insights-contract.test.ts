import { describe, expect, it } from 'vitest';
import { focusSignature, validClassInsights, type ClassInsightsView } from './class-insights-contract';

const actorId = '11111111-1111-4111-8111-111111111111';
const classId = '33333333-3333-4333-8333-333333333333';
function fixture(workspace: 'teach' | 'admin' = 'teach'): ClassInsightsView {
  return { actorId, report: { algorithmVersion: 'class-insights-v1', classroom: { id: classId, name: 'Synthetic class' },
    generatedAt: '2026-10-30T12:00:00.000Z', view: workspace === 'admin' ? 'administrator' : 'owner', adminMinimumLearners: 5, rosterCount: 10,
    concepts: [
      { conceptId: 'hash-maps', coverageStatus: 'covered', answeredItems: 20, correctItems: 8, coveredLearners: 10, distinctQuestions: 4, observedCorrectPercent: 40, coveragePercent: 100 },
      { conceptId: 'sliding-window', coverageStatus: workspace === 'admin' ? 'suppressed' : 'limited', answeredItems: workspace === 'admin' ? null : 2, correctItems: workspace === 'admin' ? null : 1, coveredLearners: workspace === 'admin' ? null : 2, distinctQuestions: workspace === 'admin' ? null : 1, observedCorrectPercent: workspace === 'admin' ? null : 50, coveragePercent: workspace === 'admin' ? null : 20 },
      { conceptId: 'tree-recursion', coverageStatus: 'unknown', answeredItems: workspace === 'admin' ? null : 0, correctItems: workspace === 'admin' ? null : 0, coveredLearners: workspace === 'admin' ? null : 0, distinctQuestions: workspace === 'admin' ? null : 0, observedCorrectPercent: null, coveragePercent: workspace === 'admin' ? null : 0 },
    ] }, suggestion: { focusConceptIds: ['hash-maps'], reason: 'Review the selected class questions before assigning.', emptyReason: null, unavailableConceptIds: [], questions: [{
      questionId: 'synthetic-follow-up', version: 1, versionId: 'synthetic-follow-up@1', kind: 'multiple_choice', title: 'Synthetic invariant', prompt: 'Which choice preserves the invariant?', difficulty: 'foundation', activityIds: ['synthetic-pairs'], conceptIds: ['hash-maps'], options: [{ id: 'a', text: 'First synthetic choice.' }, { id: 'b', text: 'Second synthetic choice.' }],
    }] } };
}
const valid = (value: unknown, workspace: 'teach' | 'admin' = 'teach') => validClassInsights(value, actorId, classId, workspace);

describe('class insight response and follow-up preview validation', () => {
  it('accepts complete owner and suppressed administrator responses', () => {
    expect(valid(fixture())).toBe(true);
    expect(valid(fixture('admin'), 'admin')).toBe(true);
    expect(focusSignature(['tree-recursion', 'hash-maps'])).toBe('hash-maps,tree-recursion');
  });

  it('denies mismatched actor, class, view and unsupported algorithm identities', () => {
    const source = fixture();
    for (const change of [
      { actorId: classId },
      { report: { ...source.report, classroom: { ...source.report.classroom, id: actorId } } },
      { report: { ...source.report, view: 'administrator' } },
      { report: { ...source.report, algorithmVersion: 'unsupported' } },
      { report: { ...source.report, generatedAt: 'invalid' } },
    ]) expect(valid({ ...source, ...change })).toBe(false);
    expect(valid(fixture('admin'))).toBe(false);
  });

  it('rejects private extra fields rather than treating them as a public projection', () => {
    const source = fixture();
    expect(valid({ ...source, learnerId: actorId })).toBe(false);
    expect(valid({ ...source, report: { ...source.report, learners: [] } })).toBe(false);
    expect(valid({ ...source, report: { ...source.report, concepts: [{ ...source.report.concepts[0], privateNote: 'Synthetic private field' }, ...source.report.concepts.slice(1)] } })).toBe(false);
    expect(valid({ ...source, suggestion: { ...source.suggestion, questions: [{ ...source.suggestion.questions[0], correctOptionId: 'a' }] } })).toBe(false);
  });

  it('refuses malformed counts, percentages and repeated concepts without throwing', () => {
    const source = fixture();
    const first = source.report.concepts[0];
    for (const concept of [null, false, {}, { ...first, answeredItems: -1 }, { ...first, correctItems: 21 }, { ...first, coveredLearners: 11 }, { ...first, distinctQuestions: 21 }, { ...first, coveragePercent: 101 }, { ...first, observedCorrectPercent: NaN }, { ...first, observedCorrectPercent: 90 }, { ...first, coveragePercent: 20 }, { ...first, distinctQuestions: 1 }, { ...first, coveredLearners: 2, coveragePercent: 20 }, { ...first, coverageStatus: 'limited' }]) {
      const value = { ...source, report: { ...source.report, concepts: [concept, ...source.report.concepts.slice(1)] } };
      expect(() => valid(value)).not.toThrow(); expect(valid(value)).toBe(false);
    }
    expect(valid({ ...source, report: { ...source.report, concepts: [first, first] } })).toBe(false);
  });

  it('cannot reveal administrator small-cohort numbers through unknown or suppressed rows', () => {
    const source = fixture('admin');
    for (const index of [1, 2]) for (const field of ['answeredItems', 'correctItems', 'coveredLearners', 'distinctQuestions', 'observedCorrectPercent', 'coveragePercent']) {
      const concepts = source.report.concepts.map((concept, position) => position === index ? { ...concept, [field]: 0 } : concept);
      expect(valid({ ...source, report: { ...source.report, concepts } }, 'admin')).toBe(false);
    }
    const first = { ...source.report.concepts[0], coveredLearners: 4 };
    expect(valid({ ...source, report: { ...source.report, concepts: [first, ...source.report.concepts.slice(1)] } }, 'admin')).toBe(false);
  });

  it('requires bounded distinct focus concepts and matching safe question previews', () => {
    const source = fixture(), question = source.suggestion.questions[0];
    for (const change of [
      { focusConceptIds: ['unknown'] }, { focusConceptIds: ['hash-maps', 'hash-maps'] },
      { unavailableConceptIds: ['tree-recursion'] }, { unavailableConceptIds: ['hash-maps'] }, { questions: [question, question] },
      { questions: [{ ...question, difficulty: 'advanced' }] }, { questions: [{ ...question, conceptIds: ['tree-recursion'] }] },
      { questions: [{ ...question, options: [null, question.options[1]] }] },
      { questions: [{ ...question, options: [question.options[0], question.options[0]] }] },
      { questions: [{ ...question, options: [{ ...question.options[0], misconceptionTags: [] }, question.options[1]] }] },
    ]) expect(valid({ ...source, suggestion: { ...source.suggestion, ...change } })).toBe(false);
  });

  it('permits an explicit empty proposal without inventing questions or a grade', () => {
    const source = fixture();
    const suggestion = { ...source.suggestion, questions: [], unavailableConceptIds: ['hash-maps'], emptyReason: 'No fresh questions remain for this focus.' };
    expect(valid({ ...source, suggestion })).toBe(true);
    expect(valid({ ...source, suggestion: { ...suggestion, emptyReason: null } })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildDiagnosticSnapshot, DIAGNOSTIC_SELECTION_VERSION } from '../src/diagnostic';
import { freezeQuestionVersion, type QuestionVersion } from '../src/question-bank';

const activityIds = Array.from({ length: 10 }, (_, index) => `activity-${index}`);
function questions(): QuestionVersion[] {
  return activityIds.map((activityId, index) => freezeQuestionVersion({
    questionId: `diagnostic-${index}`, version: 1, versionId: `diagnostic-${index}@1`, kind: 'multiple_choice', status: 'reviewed',
    title: `Baseline ${index}`, prompt: 'Which choice preserves the invariant?', difficulty: index % 2 ? 'intermediate' : 'foundation',
    activityIds: [activityId], conceptIds: ['hash-maps'],
    options: [{ id: 'yes', text: 'The invariant is preserved.', misconceptionTags: [] }, { id: 'no', text: 'The invariant is broken.', misconceptionTags: ['invariant-missing'] }],
    correctOptionId: 'yes', explanation: 'The preserved invariant supports the result.',
    provenance: { kind: 'original', authorId: 'test-author', authoredAt: '2026-10-29T10:00:00.000Z' },
    review: { reviewerId: 'test-reviewer', reviewedAt: '2026-10-29T11:00:00.000Z', notes: 'Independent synthetic fixture review.' },
  }));
}

describe('balanced personal diagnostic blueprint', () => {
  it('pins ten reviewed questions in curriculum order with equal weight and freezes the snapshot', () => {
    const source = questions();
    const result = buildDiagnosticSnapshot([...source].reverse(), activityIds);
    expect(DIAGNOSTIC_SELECTION_VERSION).toBe('balanced-ten-v1');
    expect(result.maxUnits).toBe(1000);
    expect(result.questions.map(item => item.question.activityIds[0])).toEqual(activityIds);
    expect(result.questions.every(item => item.maxUnits === 100 && Object.isFrozen(item.question))).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.questions[0].question).not.toBe(source[0]);
  });

  it('rejects missing, repeated and ambiguous activity coverage instead of silently changing the baseline', () => {
    expect(() => buildDiagnosticSnapshot(questions(), activityIds.slice(1))).toThrow('ten distinct');
    expect(() => buildDiagnosticSnapshot(questions(), [...activityIds.slice(1), activityIds[1]])).toThrow('ten distinct');
    expect(() => buildDiagnosticSnapshot(questions().slice(1), activityIds)).toThrow('exactly one');
    const duplicated = questions();
    duplicated.push(freezeQuestionVersion({ ...duplicated[0], questionId: 'extra-baseline', versionId: 'extra-baseline@1' }));
    expect(() => buildDiagnosticSnapshot(duplicated, activityIds)).toThrow('exactly one');
  });

  it('requires reviewed baseline difficulty and a single activity per question', () => {
    for (const change of [{ status: 'in_review', review: null }, { difficulty: 'advanced' }, { activityIds: [activityIds[0], activityIds[1]] }]) {
      const source = questions();
      source[0] = freezeQuestionVersion({ ...source[0], ...change });
      expect(() => buildDiagnosticSnapshot(source, activityIds)).toThrow('exactly one');
    }
  });
});

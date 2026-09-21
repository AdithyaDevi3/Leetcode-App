import { describe, expect, it } from 'vitest';
import {
  buildLocalLearningPlan,
  defaultLocalLearnerProfile,
  recommendLocalPractice,
} from './local-learner';
import { practiceItems } from './content';

const now = new Date('2026-09-13T12:00:00.000Z');

describe('local learner plan', () => {
  it('turns a new interview learner profile into actual practice recommendations', () => {
    const plan = buildLocalLearningPlan(defaultLocalLearnerProfile, [], now);

    expect(plan.pace).toBe('standard');
    expect(plan.recommendations[0]).toMatchObject({ practiceItemId: 'pair-with-target-v1', topic: 'hashing' });
    expect(plan.recommendations[0].reasons).toContain('Matches your interview focus');
  });

  it('adapts the next algorithm for an experienced explorer', () => {
    const recommendations = recommendLocalPractice({
      ...defaultLocalLearnerProfile,
      goal: 'exploration',
      experience: 'experienced',
      weeklyMinutes: 360,
      diagnosticOptIn: true,
    }, [], undefined, now);

    expect(recommendations[0]).toMatchObject({
      practiceItemId: 'island-count-v1',
      topic: 'graphs',
      difficulty: 'intermediate',
    });
    expect(recommendations[0].reasons).toContain('Matches your exploration focus');
  });

  it('moves a just-completed high-scoring problem behind fresh practice', () => {
    const recommendations = recommendLocalPractice(defaultLocalLearnerProfile, [{
      practiceItemId: 'pair-with-target-v1',
      label: 'Pair With Target',
      completedAt: '2026-09-13T10:00:00.000Z',
      evaluationScore: 100,
    }], undefined, now);

    expect(recommendations[0].practiceItemId).toBe('first-unique-index-v1');
  });

  it('prioritizes an older lower-scoring problem for review', () => {
    const recommendations = recommendLocalPractice(defaultLocalLearnerProfile, [{
      practiceItemId: 'pair-with-target-v1',
      label: 'Pair With Target',
      completedAt: '2026-09-01T10:00:00.000Z',
      evaluationScore: 55,
    }], undefined, now);

    expect(recommendations[0].practiceItemId).toBe('pair-with-target-v1');
    expect(recommendations[0].reasons).toEqual(expect.arrayContaining([
      'Reinforces a lower-scoring skill',
      'Ready for review',
    ]));
  });

  it('uses curriculum order when personalization is disabled', () => {
    const plan = buildLocalLearningPlan({
      ...defaultLocalLearnerProfile,
      goal: 'exploration',
      experience: 'experienced',
      personalizationOptOut: true,
    }, [], now);

    expect(plan.recommendations[0].practiceItemId).toBe('pair-with-target-v1');
    expect(plan.recommendations[0].reasons).toContain('Next in the standard curriculum');
  });

  it('uses concept mastery evidence to prioritize a weaker applicable item', () => {
    const items = [practiceItems.find((item) => item.id === 'pair-with-target-v1')!, practiceItems.find((item) => item.id === 'island-count-v1')!];
    const recommendations = recommendLocalPractice(
      { ...defaultLocalLearnerProfile, goal: 'exploration', experience: 'new' },
      [],
      items,
      now,
      {
        'hash-maps': { conceptId: 'hash-maps', mastery: 0.1, confidence: 1, evidenceCount: 5, lastPracticedAt: now.toISOString() },
        'graph-traversal': { conceptId: 'graph-traversal', mastery: 1, confidence: 1, evidenceCount: 5, lastPracticedAt: now.toISOString() },
      },
    );
    expect(recommendations[0].practiceItemId).toBe('pair-with-target-v1');
  });
});

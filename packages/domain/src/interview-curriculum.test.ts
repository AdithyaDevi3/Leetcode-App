import { describe, expect, it } from 'vitest';
import {
  freezeOriginalInterviewExercise,
  INTERVIEW_CORE_250_TOTAL,
  validateInterviewCore250Catalog,
} from './interview-curriculum';

const exercise = { id: 'original-array-frequency', topic: 'arrays-hashing', primarySkillId: 'frequency-counting', difficulty: 'foundation', estimatedMinutes: 15, format: 'reasoning', prerequisiteIds: [], misconceptionIds: ['counting-distinct-values'], provenance: { kind: 'original', authorId: 'author-one', authoredAt: '2026-11-15T00:00:00.000Z' }, status: 'in_review', reviewerId: null };

describe('original interview curriculum metadata', () => {
  it('uses an exact 250-item topic allocation', () => expect(INTERVIEW_CORE_250_TOTAL).toBe(250));
  it('accepts bounded original exercise metadata', () => expect(freezeOriginalInterviewExercise(exercise)).toMatchObject({ id: exercise.id, topic: exercise.topic }));
  it('rejects copied provenance, self-review, and invalid topics', () => {
    expect(() => freezeOriginalInterviewExercise({ ...exercise, provenance: { ...exercise.provenance, kind: 'imported' } })).toThrow('original');
    expect(() => freezeOriginalInterviewExercise({ ...exercise, status: 'reviewed', reviewerId: 'author-one' })).toThrow('independent');
    expect(() => freezeOriginalInterviewExercise({ ...exercise, topic: 'copied-list' })).toThrow('topic');
  });
  it('requires a complete catalog before claiming 250-item coverage', () => expect(() => validateInterviewCore250Catalog([exercise])).toThrow('exactly 250'));
});

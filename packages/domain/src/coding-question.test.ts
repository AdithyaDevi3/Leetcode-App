import { describe, expect, it } from 'vitest';
import { customizeCodingQuestion, freezeOriginalCodingQuestion } from './coding-question';

const question = {
  id: 'array-frequency-summary', topic: 'arrays-hashing', difficulty: 'foundation', estimatedMinutes: 15,
  title: 'Summarize value frequency', prompt: 'Return the count for each value in the input list.',
  functionName: 'summarizeFrequency', functionSignature: 'values: number[]',
  constraints: ['Use O(n) expected time.', 'Do not change the input list.'],
  examples: [{ input: 'values = [2, 2, 5]', output: '{2: 2, 5: 1}', note: 'Each value has one count.' }],
  starterDraft: 'Create a map from value to count. Scan the values once. Return the map.',
  conceptIds: ['frequency-counting', 'hash-maps'],
  provenance: { kind: 'original', authorId: 'personal-author', authoredAt: '2026-11-16T20:00:00.000Z' },
  status: 'in_review', reviewerId: null,
};

describe('original coding questions', () => {
  it('freezes a bounded original coding question', () => {
    expect(freezeOriginalCodingQuestion(question)).toMatchObject({ id: question.id, functionName: question.functionName });
  });

  it('allows permitted personal changes and returns a new draft', () => {
    const result = customizeCodingQuestion(freezeOriginalCodingQuestion(question), { title: 'Count repeated values', estimatedMinutes: 20 });
    expect(result).toMatchObject({ title: 'Count repeated values', estimatedMinutes: 20, status: 'draft', reviewerId: null });
    expect(result.id).toBe(question.id);
  });

  it('rejects copied provenance, self-review, and identity changes', () => {
    expect(() => freezeOriginalCodingQuestion({ ...question, provenance: { ...question.provenance, kind: 'imported' } })).toThrow('original');
    expect(() => freezeOriginalCodingQuestion({ ...question, status: 'reviewed', reviewerId: 'personal-author' })).toThrow('independent');
    expect(() => customizeCodingQuestion(freezeOriginalCodingQuestion(question), { id: 'other-question' } as never)).toThrow('cannot');
  });
});

import { describe, expect, it } from 'vitest';
import { evaluatePseudocode } from './evaluator';
import { evaluationGoldSet } from './evaluation-gold-set';

describe('evaluation gold set', () => {
  it.each(evaluationGoldSet)('$id preserves expected approval', ({ draft, problemId, approved }) => {
    expect(evaluatePseudocode(draft, problemId).approved).toBe(approved);
  });
});

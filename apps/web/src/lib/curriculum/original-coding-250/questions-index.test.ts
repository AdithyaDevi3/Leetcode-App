import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Candidates, validateOriginalCoding250Candidates } from './questions-index';

describe('original coding 250 catalog', () => {
  it('indexes 250 review-gated coding questions', () => {
    expect(originalCoding250Candidates).toHaveLength(250);
    expect(validateOriginalCoding250Candidates()).toEqual(originalCoding250Candidates);
    expect(new Set(originalCoding250Candidates.map(item => item.topic)).size).toBe(18);
  });

  it('rejects duplicate and reviewed entries before catalog publication', () => {
    expect(() => validateOriginalCoding250Candidates([originalCoding250Candidates[0], originalCoding250Candidates[0]])).toThrow('unique');
    expect(() => validateOriginalCoding250Candidates([{ ...originalCoding250Candidates[0], status: 'reviewed', reviewerId: 'independent-reviewer' }])).toThrow('review-gated');
  });
});

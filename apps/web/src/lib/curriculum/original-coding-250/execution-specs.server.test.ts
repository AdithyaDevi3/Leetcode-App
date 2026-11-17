import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { originalCoding250Candidates } from './questions-index';
import { expectedOriginalCodingOutput, originalCodingExecutionSpecs } from './execution-specs.server';

describe('original Coding 250 execution specifications', () => {
  it('uses only candidate IDs and keeps each check deterministic', () => {
    const candidates = new Map(originalCoding250Candidates.map(item => [item.id, item]));
    for (const [questionId, specification] of Object.entries(originalCodingExecutionSpecs)) {
      expect(candidates.has(questionId)).toBe(true);
      expect(specification.functionName).toBe(candidates.get(questionId)?.functionName);
      for (const hiddenCase of specification.cases) {
        expect(expectedOriginalCodingOutput(questionId, hiddenCase.args)).toEqual(expectedOriginalCodingOutput(questionId, hiddenCase.args));
      }
    }
  });

  it('calculates expected values on the server instead of storing them in hidden cases', () => {
    const hiddenCase = originalCodingExecutionSpecs['first-repeat-position'].cases[0];
    expect(hiddenCase).not.toHaveProperty('expected');
    expect(expectedOriginalCodingOutput('first-repeat-position', hiddenCase.args)).toBe(2);
  });
});

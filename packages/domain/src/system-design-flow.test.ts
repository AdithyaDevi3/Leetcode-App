import { describe, expect, it } from 'vitest';
import { canCompleteSystemDesignStage, nextSystemDesignStage } from './system-design-flow';

describe('system design staged flow', () => {
  it('requires stages to progress in order', () => {
    expect(nextSystemDesignStage(null, [])).toBe('requirements');
    expect(nextSystemDesignStage('requirements', [])).toBe('requirements');
    expect(nextSystemDesignStage('requirements', ['requirements'])).toBe('assumptions');
  });
  it('checks evidence for each stage', () => {
    expect(canCompleteSystemDesignStage('architecture', { requirements: ['r'], assumptions: ['a'], components: [], failureNotes: [] })).toBe(false);
    expect(canCompleteSystemDesignStage('review', { requirements: ['r'], assumptions: ['a'], components: [{}], failureNotes: ['f'] })).toBe(true);
  });
});

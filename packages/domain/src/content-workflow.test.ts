import { describe, expect, it } from 'vitest';
import { canTransitionContent } from './content-workflow';

describe('content workflow', () => {
  it('requires approval to publish and deprecate immutable versions', () => {
    expect(canTransitionContent('draft', 'review', false)).toBe(true);
    expect(canTransitionContent('review', 'published', false)).toBe(false);
    expect(canTransitionContent('review', 'published', true)).toBe(true);
  });
  it('prevents unsupported lifecycle transitions', () => {
    expect(canTransitionContent('draft', 'published', true)).toBe(false);
  });
});

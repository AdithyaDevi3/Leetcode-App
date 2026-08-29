import { describe, expect, it } from 'vitest';
import { canTransitionLifecycleRequest } from './account-lifecycle';

describe('account lifecycle requests', () => {
  it('allows only forward operational transitions', () => {
    expect(canTransitionLifecycleRequest('requested', 'processing')).toBe(true);
    expect(canTransitionLifecycleRequest('processing', 'completed')).toBe(true);
    expect(canTransitionLifecycleRequest('completed', 'processing')).toBe(false);
  });
});

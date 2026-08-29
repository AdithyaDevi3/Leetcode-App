import { describe, expect, it } from 'vitest';
import { canPerformAdministrationAction } from './administration';

describe('administration authorization', () => {
  it('permits only roles assigned to an action', () => {
    expect(canPerformAdministrationAction(['content_author'], 'content.write')).toBe(true);
    expect(canPerformAdministrationAction(['content_author'], 'content.publish')).toBe(false);
  });
  it('allows administrators across privileged operations', () => {
    expect(canPerformAdministrationAction(['administrator'], 'privacy.export')).toBe(true);
  });
});

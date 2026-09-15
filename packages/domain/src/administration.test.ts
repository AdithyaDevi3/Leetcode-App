import { describe, expect, it } from 'vitest';
import {
  administrationRoles,
  canPerformAdministrationAction,
  isAdministrationRole,
} from './administration';

describe('administration authorization', () => {
  it('permits only roles assigned to an action', () => {
    expect(canPerformAdministrationAction(['content_author'], 'content.write')).toBe(true);
    expect(canPerformAdministrationAction(['content_author'], 'content.publish')).toBe(false);
  });
  it('allows administrators across privileged operations', () => {
    expect(canPerformAdministrationAction(['administrator'], 'privacy.export')).toBe(true);
    expect(canPerformAdministrationAction(['administrator'], 'administration.manage')).toBe(true);
    expect(canPerformAdministrationAction(['administrator'], 'audit.read')).toBe(true);
  });
  it('allows every operator role to enter the administration portal', () => {
    for (const role of administrationRoles) {
      expect(canPerformAdministrationAction([role], 'administration.access')).toBe(true);
    }
  });
  it('keeps area access least-privilege', () => {
    expect(canPerformAdministrationAction(['support'], 'users.read')).toBe(true);
    expect(canPerformAdministrationAction(['support'], 'operations.read')).toBe(false);
    expect(canPerformAdministrationAction(['evaluator_reviewer'], 'evaluation.read')).toBe(true);
    expect(canPerformAdministrationAction(['content_author'], 'content.publish')).toBe(false);
  });
  it('validates role input at runtime', () => {
    expect(isAdministrationRole('administrator')).toBe(true);
    expect(isAdministrationRole('learner')).toBe(false);
    expect(isAdministrationRole(null)).toBe(false);
  });
});

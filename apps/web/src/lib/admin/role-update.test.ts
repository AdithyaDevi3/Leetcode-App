import { describe, expect, it } from 'vitest';
import { parseAdministrationRoleUpdate } from './role-update';

const userId = '11111111-1111-4111-8111-111111111111';

describe('administration role update validation', () => {
  it('accepts known roles in canonical order and removes duplicates', () => {
    const form = new FormData();
    form.set('targetUserId', userId);
    form.append('roles', 'support');
    form.append('roles', 'administrator');
    form.append('roles', 'support');
    form.set('reason', 'On-call support rotation');

    expect(parseAdministrationRoleUpdate(form)).toEqual({
      success: true,
      data: { targetUserId: userId, roles: ['support', 'administrator'], reason: 'On-call support rotation' },
    });
  });

  it('rejects unknown roles and short reasons', () => {
    const unknownRole = new FormData();
    unknownRole.set('targetUserId', userId);
    unknownRole.set('roles', 'learner');
    unknownRole.set('reason', 'Valid operational reason');
    expect(parseAdministrationRoleUpdate(unknownRole)).toEqual({ success: false, message: 'One or more selected roles are invalid.' });

    const shortReason = new FormData();
    shortReason.set('targetUserId', userId);
    shortReason.set('reason', 'short');
    expect(parseAdministrationRoleUpdate(shortReason)).toEqual({ success: false, message: 'Give a reason between 8 and 500 characters.' });
  });
});

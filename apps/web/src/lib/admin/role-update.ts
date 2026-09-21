import {
  administrationRoles,
  isAdministrationRole,
  type AdministrationRole,
} from '@leetcode-app/domain';

export type RoleUpdateInput = {
  targetUserId: string;
  roles: AdministrationRole[];
  reason: string;
};

export type RoleUpdateValidation =
  | { success: true; data: RoleUpdateInput }
  | { success: false; message: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAdministrationRoleUpdate(formData: FormData): RoleUpdateValidation {
  const targetUserId = String(formData.get('targetUserId') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  const rawRoles = formData.getAll('roles');

  if (!uuidPattern.test(targetUserId)) return { success: false, message: 'Choose a valid user.' };
  if (reason.length < 8 || reason.length > 500) {
    return { success: false, message: 'Give a reason between 8 and 500 characters.' };
  }
  if (!rawRoles.every(isAdministrationRole)) {
    return { success: false, message: 'One or more selected roles are invalid.' };
  }

  const selected = new Set(rawRoles as AdministrationRole[]);
  return {
    success: true,
    data: {
      targetUserId,
      roles: administrationRoles.filter((role) => selected.has(role)),
      reason,
    },
  };
}

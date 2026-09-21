export const administrationRoles = [
  'content_author',
  'content_reviewer',
  'rights_reviewer',
  'evaluator_reviewer',
  'support',
  'privacy_operator',
  'administrator',
] as const;

export type AdministrationRole = (typeof administrationRoles)[number];

export const administrationActions = [
  'administration.access',
  'administration.manage',
  'audit.read',
  'classes.read',
  'classes.manage',
  'content.read',
  'content.write',
  'content.publish',
  'evaluation.read',
  'evaluation.review',
  'feature.manage',
  'operations.read',
  'privacy.read',
  'privacy.export',
  'support.read',
  'users.read',
] as const;

export type AdministrationAction = (typeof administrationActions)[number];

const permissions: Record<AdministrationAction, AdministrationRole[]> = {
  'administration.access': [...administrationRoles],
  'administration.manage': ['administrator'],
  'audit.read': ['administrator'],
  'classes.read': ['administrator'],
  'classes.manage': ['administrator'],
  'content.read': ['content_author', 'content_reviewer', 'rights_reviewer', 'administrator'],
  'content.write': ['content_author', 'administrator'],
  'content.publish': ['content_reviewer', 'rights_reviewer', 'administrator'],
  'evaluation.read': ['evaluator_reviewer', 'administrator'],
  'evaluation.review': ['evaluator_reviewer', 'administrator'],
  'operations.read': ['evaluator_reviewer', 'administrator'],
  'support.read': ['support', 'administrator'],
  'privacy.read': ['privacy_operator', 'administrator'],
  'privacy.export': ['privacy_operator', 'administrator'],
  'feature.manage': ['administrator'],
  'users.read': ['support', 'privacy_operator', 'administrator'],
};

export function canPerformAdministrationAction(roles: AdministrationRole[], action: AdministrationAction): boolean {
  return roles.some((role) => permissions[action].includes(role));
}

export function isAdministrationRole(value: unknown): value is AdministrationRole {
  return typeof value === 'string' && administrationRoles.includes(value as AdministrationRole);
}

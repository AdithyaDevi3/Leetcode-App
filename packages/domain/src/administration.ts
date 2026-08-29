export type AdministrationRole = 'content_author' | 'content_reviewer' | 'rights_reviewer' | 'evaluator_reviewer' | 'support' | 'privacy_operator' | 'administrator';
export type AdministrationAction = 'content.write' | 'content.publish' | 'evaluation.review' | 'support.read' | 'privacy.export' | 'feature.manage';

const permissions: Record<AdministrationAction, AdministrationRole[]> = {
  'content.write': ['content_author', 'administrator'],
  'content.publish': ['content_reviewer', 'rights_reviewer', 'administrator'],
  'evaluation.review': ['evaluator_reviewer', 'administrator'],
  'support.read': ['support', 'administrator'],
  'privacy.export': ['privacy_operator', 'administrator'],
  'feature.manage': ['administrator'],
};

export function canPerformAdministrationAction(roles: AdministrationRole[], action: AdministrationAction): boolean {
  return roles.some((role) => permissions[action].includes(role));
}

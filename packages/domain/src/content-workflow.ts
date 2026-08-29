export type ContentWorkflowStatus = 'draft' | 'review' | 'published' | 'deprecated' | 'archived';
export type ContentWorkflowTransition = { from: ContentWorkflowStatus; to: ContentWorkflowStatus; requiresApproval: boolean };

const transitions: ContentWorkflowTransition[] = [
  { from: 'draft', to: 'review', requiresApproval: false },
  { from: 'review', to: 'draft', requiresApproval: false },
  { from: 'review', to: 'published', requiresApproval: true },
  { from: 'published', to: 'deprecated', requiresApproval: true },
  { from: 'deprecated', to: 'archived', requiresApproval: true },
  { from: 'deprecated', to: 'published', requiresApproval: true },
];

export function getContentWorkflowTransition(from: ContentWorkflowStatus, to: ContentWorkflowStatus): ContentWorkflowTransition | null {
  return transitions.find((transition) => transition.from === from && transition.to === to) ?? null;
}

export function canTransitionContent(status: ContentWorkflowStatus, target: ContentWorkflowStatus, approved: boolean): boolean {
  const transition = getContentWorkflowTransition(status, target);
  return Boolean(transition && (!transition.requiresApproval || approved));
}

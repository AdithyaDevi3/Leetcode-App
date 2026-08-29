export type SystemDesignComponent = { id: string; label: string; kind: 'client' | 'service' | 'database' | 'queue' | 'cache' | 'external' };
export type SystemDesignConnection = { from: string; to: string; label?: string };
export type SystemDesignDocument = { title: string; requirements: string[]; assumptions: string[]; components: SystemDesignComponent[]; connections: SystemDesignConnection[]; failureNotes: string[] };

export function validateSystemDesignDocument(document: SystemDesignDocument): string[] {
  const errors: string[] = [];
  if (!document.title.trim()) errors.push('Title is required');
  if (!document.requirements.length) errors.push('At least one requirement is required');
  if (!document.assumptions.length) errors.push('At least one assumption is required');
  if (!document.components.length) errors.push('At least one component is required');
  if (!document.failureNotes.length) errors.push('At least one failure consideration is required');
  const ids = new Set(document.components.map((component) => component.id));
  if (ids.size !== document.components.length) errors.push('Component IDs must be unique');
  for (const connection of document.connections) if (!ids.has(connection.from) || !ids.has(connection.to)) errors.push(`Connection references an unknown component: ${connection.from}->${connection.to}`);
  return [...new Set(errors)];
}

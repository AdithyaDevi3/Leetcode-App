import {
  canCompleteSystemDesignStage,
  type SystemDesignComponent,
  type SystemDesignConnection,
  type SystemDesignDocument,
  type SystemDesignStage,
  validateSystemDesignDocument,
} from '@leetcode-app/domain';

export type ComponentKind = SystemDesignComponent['kind'];

export function createSystemDesignDraft(): SystemDesignDocument {
  return {
    title: '',
    requirements: [],
    assumptions: [],
    components: [],
    connections: [],
    failureNotes: [],
  };
}

export function addDraftItem<T extends 'requirements' | 'assumptions' | 'failureNotes'>(
  document: SystemDesignDocument,
  field: T,
  value: string,
): SystemDesignDocument {
  const trimmed = value.trim();
  if (!trimmed || document[field].includes(trimmed)) return document;
  return { ...document, [field]: [...document[field], trimmed] };
}

export function removeDraftItem<T extends 'requirements' | 'assumptions' | 'failureNotes'>(
  document: SystemDesignDocument,
  field: T,
  index: number,
): SystemDesignDocument {
  return { ...document, [field]: document[field].filter((_, itemIndex) => itemIndex !== index) };
}

export function addDraftComponent(document: SystemDesignDocument, label: string, kind: ComponentKind): SystemDesignDocument {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) return document;
  const baseId = normalizedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'component';
  const ids = new Set(document.components.map((component) => component.id));
  let suffix = 1;
  let id = baseId;
  while (ids.has(id)) id = `${baseId}-${suffix++}`;
  return { ...document, components: [...document.components, { id, label: normalizedLabel, kind }] };
}

export function removeDraftComponent(document: SystemDesignDocument, id: string): SystemDesignDocument {
  return {
    ...document,
    components: document.components.filter((component) => component.id !== id),
    connections: document.connections.filter((connection) => connection.from !== id && connection.to !== id),
  };
}

export function addDraftConnection(document: SystemDesignDocument, connection: SystemDesignConnection): SystemDesignDocument {
  if (!connection.from || !connection.to || connection.from === connection.to) return document;
  const duplicate = document.connections.some((item) => item.from === connection.from && item.to === connection.to && item.label === connection.label);
  return duplicate ? document : { ...document, connections: [...document.connections, connection] };
}

export function removeDraftConnection(document: SystemDesignDocument, index: number): SystemDesignDocument {
  return { ...document, connections: document.connections.filter((_, connectionIndex) => connectionIndex !== index) };
}

export function getDesignStageStatus(document: SystemDesignDocument): Record<SystemDesignStage, boolean> {
  return {
    requirements: canCompleteSystemDesignStage('requirements', document),
    assumptions: canCompleteSystemDesignStage('assumptions', document),
    architecture: canCompleteSystemDesignStage('architecture', document),
    failure_analysis: canCompleteSystemDesignStage('failure_analysis', document),
    review: canCompleteSystemDesignStage('review', document),
  };
}

export function getDesignValidationErrors(document: SystemDesignDocument): string[] {
  return validateSystemDesignDocument(document);
}

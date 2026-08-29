import { describe, expect, it } from 'vitest';
import {
  addDraftComponent,
  addDraftConnection,
  addDraftItem,
  createSystemDesignDraft,
  getDesignStageStatus,
  getDesignValidationErrors,
  removeDraftComponent,
} from './system-design-model';

describe('system-design draft helpers', () => {
  it('adds unique text items without mutating the source draft', () => {
    const draft = createSystemDesignDraft();
    const updated = addDraftItem(draft, 'requirements', ' Serve read traffic ');

    expect(draft.requirements).toEqual([]);
    expect(updated.requirements).toEqual(['Serve read traffic']);
    expect(addDraftItem(updated, 'requirements', 'Serve read traffic')).toBe(updated);
  });

  it('creates stable unique component identifiers and removes dangling connections', () => {
    const first = addDraftComponent(createSystemDesignDraft(), 'API Gateway', 'service');
    const second = addDraftComponent(first, 'API Gateway', 'service');
    const connected = addDraftConnection(second, { from: 'api-gateway', to: 'api-gateway-1', label: 'routes' });
    const removed = removeDraftComponent(connected, 'api-gateway');

    expect(second.components.map((component) => component.id)).toEqual(['api-gateway', 'api-gateway-1']);
    expect(removed.components.map((component) => component.id)).toEqual(['api-gateway-1']);
    expect(removed.connections).toEqual([]);
  });

  it('summarizes stage completion and delegates complete-document validation to the domain layer', () => {
    const partial = addDraftItem(createSystemDesignDraft(), 'requirements', 'Handle 100 requests per second');
    expect(getDesignStageStatus(partial)).toMatchObject({ requirements: true, assumptions: false, review: false });
    expect(getDesignValidationErrors(partial)).toContain('At least one component is required');
  });
});

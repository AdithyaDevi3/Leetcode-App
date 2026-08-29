import { describe, expect, it } from 'vitest';
import { prerequisitesFor, validateConceptGraph } from './concept-graph';

describe('concept graph', () => {
  it('validates prerequisites and returns direct dependencies', () => {
    const graph = { nodes: [{ id: 'arrays', label: 'Arrays' }, { id: 'hashing', label: 'Hashing' }], edges: [{ prerequisiteId: 'arrays', conceptId: 'hashing' }] };
    expect(validateConceptGraph(graph)).toEqual([]);
    expect(prerequisitesFor(graph, 'hashing')).toEqual(['arrays']);
  });
  it('rejects missing nodes, duplicate IDs, and cycles', () => {
    const graph = { nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'Duplicate' }], edges: [{ prerequisiteId: 'a', conceptId: 'b' }, { prerequisiteId: 'a', conceptId: 'a' }] };
    expect(validateConceptGraph(graph)).toEqual(expect.arrayContaining(['Concept IDs must be unique', 'Concept cannot prerequisite itself: a']));
  });
});

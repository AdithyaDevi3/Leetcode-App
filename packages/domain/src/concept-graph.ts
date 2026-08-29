export type ConceptNode = { id: string; label: string; description?: string };
export type ConceptEdge = { prerequisiteId: string; conceptId: string };
export type ConceptGraph = { nodes: ConceptNode[]; edges: ConceptEdge[] };

export function validateConceptGraph(graph: ConceptGraph): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) errors.push('Concept IDs must be unique');
  for (const edge of graph.edges) {
    if (!ids.has(edge.prerequisiteId) || !ids.has(edge.conceptId)) errors.push(`Edge references an unknown concept: ${edge.prerequisiteId}->${edge.conceptId}`);
    if (edge.prerequisiteId === edge.conceptId) errors.push(`Concept cannot prerequisite itself: ${edge.conceptId}`);
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) adjacency.set(edge.prerequisiteId, [...(adjacency.get(edge.prerequisiteId) ?? []), edge.conceptId]);
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = (adjacency.get(id) ?? []).some(visit);
    visiting.delete(id); visited.add(id); return cycle;
  };
  if ([...ids].some(visit)) errors.push('Concept prerequisites cannot contain cycles');
  return [...new Set(errors)];
}

export function prerequisitesFor(graph: ConceptGraph, conceptId: string): string[] {
  return graph.edges.filter((edge) => edge.conceptId === conceptId).map((edge) => edge.prerequisiteId);
}

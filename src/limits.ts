export const LIMITS = {
  MAX_NODES: 50,
  MAX_EDGES: 100,
  MAX_OPTIONS: 10,
} as const;

export interface LimitViolation {
  field: 'nodes' | 'edges' | 'options';
  actual: number;
  limit: number;
}

export function validateGraphLimits(
  graph: { nodes: unknown[]; edges: unknown[] },
  options?: unknown[],
): LimitViolation[] {
  const violations: LimitViolation[] = [];
  if (graph.nodes.length > LIMITS.MAX_NODES) {
    violations.push({ field: 'nodes', actual: graph.nodes.length, limit: LIMITS.MAX_NODES });
  }
  if (graph.edges.length > LIMITS.MAX_EDGES) {
    violations.push({ field: 'edges', actual: graph.edges.length, limit: LIMITS.MAX_EDGES });
  }
  if (options && options.length > LIMITS.MAX_OPTIONS) {
    violations.push({ field: 'options', actual: options.length, limit: LIMITS.MAX_OPTIONS });
  }
  return violations;
}

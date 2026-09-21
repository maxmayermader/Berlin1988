import { nodeId, type EdgeType, type MapDefinition, type MapNode, type NodeId, type Sector } from '@berlin/shared';

/**
 * The shared map builder. Every map file declares nodes and edges as flat
 * data and calls `buildMap` — the expansion of each undirected edge into the
 * two directed entries `MapNode.edges` holds lives here once, so a new map is
 * a data file and nothing else (packages/engine/src/content/CLAUDE.md: "Maps
 * are pure data").
 */

export interface RawNode {
  id: string;
  name: string;
  sector: Sector;
  /** Percentages, for responsive SVG layout. */
  x: number;
  y: number;
  uBahn?: boolean;
  extractionFor?: Sector;
  informant?: boolean;
}

/** [from, to, type] — declared once, expanded to both directions by buildMap. */
export type RawEdge = [string, string, EdgeType];

/**
 * Throws on a malformed map rather than returning a broken one: an edge
 * naming a node that doesn't exist is a programmer error in a data file, and
 * the engine's "total" rule covers rule violations at runtime, not content
 * that could never have been valid. `tests/map-invariants.test.ts` checks the
 * softer design properties (degree, station count, extraction coverage) that
 * a map can get wrong while still being structurally well-formed.
 */
export function buildMap(
  id: string,
  name: string,
  rawNodes: readonly RawNode[],
  rawEdges: readonly RawEdge[],
): MapDefinition {
  const edgesByNode = new Map<string, { to: NodeId; type: EdgeType }[]>();
  for (const n of rawNodes) {
    if (edgesByNode.has(n.id)) throw new Error(`${id}: duplicate node id ${n.id}`);
    edgesByNode.set(n.id, []);
  }

  for (const [a, b, type] of rawEdges) {
    const from = edgesByNode.get(a);
    const to = edgesByNode.get(b);
    if (!from) throw new Error(`${id}: edge references unknown node ${a}`);
    if (!to) throw new Error(`${id}: edge references unknown node ${b}`);
    from.push({ to: nodeId(b), type });
    to.push({ to: nodeId(a), type });
  }

  const nodes: MapNode[] = rawNodes.map((n) => ({
    id: nodeId(n.id),
    name: n.name,
    sector: n.sector,
    x: n.x,
    y: n.y,
    edges: edgesByNode.get(n.id)!,
    isUBahnStation: n.uBahn ?? false,
    extractionFor: n.extractionFor ?? null,
    hasInformant: n.informant ?? false,
  }));

  return { id, name, nodes };
}

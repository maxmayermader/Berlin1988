import type { EdgeType, MapDefinition, MapNode, NodeId } from '@berlin/shared';

/** Map queries. Pure functions over static geometry — no game state involved. */

export function nodeOf(map: MapDefinition, id: NodeId): MapNode {
  const n = map.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown node: ${id}`);
  return n;
}

export function hasNode(map: MapDefinition, id: NodeId): boolean {
  return map.nodes.some((x) => x.id === id);
}

/** Every node one edge away, regardless of edge type. */
export function neighbours(map: MapDefinition, id: NodeId): NodeId[] {
  return nodeOf(map, id).edges.map((e) => e.to);
}

export function edgeBetween(
  map: MapDefinition,
  from: NodeId,
  to: NodeId,
): EdgeType | null {
  const e = nodeOf(map, from).edges.find((x) => x.to === to);
  return e ? e.type : null;
}

export function areAdjacent(map: MapDefinition, a: NodeId, b: NodeId): boolean {
  return edgeBetween(map, a, b) !== null;
}

/** Hop count ignoring edge type. Returns Infinity if unreachable. */
export function distance(map: MapDefinition, from: NodeId, to: NodeId): number {
  if (from === to) return 0;
  const seen = new Set<string>([from]);
  let frontier: NodeId[] = [from];
  let d = 0;
  while (frontier.length > 0) {
    d++;
    const nextFrontier: NodeId[] = [];
    for (const cur of frontier) {
      for (const nb of neighbours(map, cur)) {
        if (seen.has(nb)) continue;
        if (nb === to) return d;
        seen.add(nb);
        nextFrontier.push(nb);
      }
    }
    frontier = nextFrontier;
  }
  return Infinity;
}

/** Every node within `range` hops, excluding the origin. */
export function withinRange(
  map: MapDefinition,
  from: NodeId,
  range: number,
): NodeId[] {
  const seen = new Set<string>([from]);
  let frontier: NodeId[] = [from];
  const out: NodeId[] = [];
  for (let d = 0; d < range; d++) {
    const nextFrontier: NodeId[] = [];
    for (const cur of frontier) {
      for (const nb of neighbours(map, cur)) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        out.push(nb);
        nextFrontier.push(nb);
      }
    }
    frontier = nextFrontier;
  }
  return out;
}

export function uBahnStations(map: MapDefinition): NodeId[] {
  return map.nodes.filter((n) => n.isUBahnStation).map((n) => n.id);
}

export function extractionPointFor(
  map: MapDefinition,
  faction: string,
): NodeId | null {
  const n = map.nodes.find((x) => x.extractionFor === faction);
  return n ? n.id : null;
}

/**
 * Escape destination for Dead Drop and blockade survival: the player's own
 * safehouse or the nearest U-Bahn station, whichever is fewer hops away.
 * Ties go to the safehouse — it's the more deliberate choice.
 */
export function nearestRefuge(
  map: MapDefinition,
  from: NodeId,
  safehouse: NodeId | null,
  isBlocked: (id: NodeId) => boolean,
): NodeId | null {
  let best: NodeId | null = null;
  let bestDist = Infinity;

  if (safehouse && safehouse !== from && !isBlocked(safehouse)) {
    best = safehouse;
    bestDist = distance(map, from, safehouse);
  }

  // Stations are sorted by id so the choice is stable across runs.
  const stations = uBahnStations(map)
    .filter((s) => s !== from && !isBlocked(s))
    .sort();
  for (const s of stations) {
    const d = distance(map, from, s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return bestDist === Infinity ? null : best;
}

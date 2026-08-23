import type { MapDefinition, MapNode, NodeId } from '@berlin/shared';

/**
 * Pure board maths — apps/web/lib/CLAUDE.md rule 2 (no fetch, no React) and
 * apps/web/components/board/CLAUDE.md rule 1 (layout comes entirely from map
 * data). Every coordinate, hit target, and traversal answer is a function of
 * the map alone, so this module is unit-testable without a DOM and without
 * assuming there are twelve nodes.
 */

/**
 * The invisible click/tap radius from 01-UI-SPEC.md's 44px spacing
 * exception. The *rendered* node circle can be smaller — this constant is
 * the minimum hit-target diameter, not a visual size.
 */
export const HIT_TARGET_PX = 44;

export interface Point {
  readonly cx: number;
  readonly cy: number;
}

/**
 * Maps a node's 0-100 x/y percentages directly onto the board's fixed
 * `0 0 100 100` SVG viewBox. No clamping: a node at the extremes (0 or 100)
 * projects onto the viewBox corner exactly, which matters because duel-12
 * only uses the 10-88 range and a later map may use the full span.
 * Pure in the node alone — same node, same coordinates, regardless of map,
 * round, or viewer.
 */
export function projectNode(node: MapNode): Point {
  return { cx: node.x, cy: node.y };
}

/**
 * The `d` attribute for a straight segment between two nodes. Symmetric by
 * construction — edgePath(a, b) and edgePath(b, a) describe the identical
 * segment, so a caller de-duplicating a map's bidirectionally-expanded edge
 * list renders exactly one line per connection.
 */
export function edgePath(from: MapNode, to: MapNode): string {
  const a = projectNode(from);
  const b = projectNode(to);
  const aFirst = a.cx - b.cx || a.cy - b.cy;
  const [start, end] = aFirst <= 0 ? [a, b] : [b, a];
  return `M ${start.cx} ${start.cy} L ${end.cx} ${end.cy}`;
}

/**
 * Every node one edge away, regardless of edge type (street, tunnel, or
 * checkpoint) — reads `MapNode.edges` directly. Never branches on the map
 * id, so a synthetic or future map works identically.
 */
export function adjacentTo(map: MapDefinition, id: NodeId): NodeId[] {
  const node = map.nodes.find((n) => n.id === id);
  return node ? node.edges.map((e) => e.to) : [];
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/** Whichever axis dominates the offset decides the neighbour's one
 *  compass direction — this is what makes traversalOrder's four calls
 *  partition a node's neighbours rather than double-counting one. */
function dominantDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}

/**
 * The neighbour of `fromId` most aligned with `direction`, or null when no
 * neighbour lies that way — arrow-key navigation stops at a dead end rather
 * than wrapping or throwing. When more than one neighbour shares a
 * direction, the closest one wins.
 */
export function traversalOrder(
  map: MapDefinition,
  fromId: NodeId,
  direction: Direction,
): NodeId | null {
  const from = map.nodes.find((n) => n.id === fromId);
  if (!from) return null;
  const origin = projectNode(from);

  let best: NodeId | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const to of adjacentTo(map, fromId)) {
    const node = map.nodes.find((n) => n.id === to);
    if (!node) continue;
    const p = projectNode(node);
    const dx = p.cx - origin.cx;
    const dy = p.cy - origin.cy;
    if (dominantDirection(dx, dy) !== direction) continue;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = to;
    }
  }

  return best;
}

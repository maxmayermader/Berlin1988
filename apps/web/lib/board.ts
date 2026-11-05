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

/** A rectangle in viewBox units. */
export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Room around the outermost nodes: names hang below a node, extraction
 *  tags below that, so the bottom margin is the widest. */
const VIEW_PAD = { left: 9, right: 9, top: 7, bottom: 10 } as const;

/**
 * The tightest viewBox that holds every node plus label room. Read from the
 * map's own coordinates, so a map that only uses the 10-88 range fills the
 * sheet instead of floating in empty paper — and a future map that uses the
 * full 0-100 span still fits, with zero code changes here.
 */
export function fitViewBox(map: MapDefinition): ViewBox {
  if (map.nodes.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of map.nodes) {
    const { cx, cy } = projectNode(node);
    minX = Math.min(minX, cx);
    minY = Math.min(minY, cy);
    maxX = Math.max(maxX, cx);
    maxY = Math.max(maxY, cy);
  }
  const x = minX - VIEW_PAD.left;
  const y = minY - VIEW_PAD.top;
  return { x, y, w: maxX + VIEW_PAD.right - x, h: maxY + VIEW_PAD.bottom - y };
}

interface Vec {
  readonly x: number;
  readonly y: number;
}

/** One territory cell: the region of the sheet closer to `nodeId` than to
 *  any other node. `edges[k]` runs from `points[k]` to `points[k+1]` (and
 *  the last back to the first); `neighbour[k]` names the node on the other
 *  side of that edge, or null where the edge is the sheet's own border. */
export interface TerritoryCell {
  readonly nodeId: NodeId;
  readonly points: readonly Vec[];
  readonly neighbour: readonly (NodeId | null)[];
}

/**
 * Voronoi cells for every node, clipped to `box` — computed by successive
 * half-plane clipping (Sutherland-Hodgman), which at eighteen nodes is a
 * few hundred float operations and needs no geometry dependency.
 *
 * Purely decorative territory: it is a function of public map geometry
 * alone (node x/y), never of anything in the fog, so drawing it reveals
 * nothing a printed map wouldn't.
 */
export function territoryCells(map: MapDefinition, box: ViewBox): TerritoryCell[] {
  const sites = map.nodes.map((n) => ({ id: n.id, p: { x: n.x, y: n.y } }));
  const corners: Vec[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];

  return sites.map((site) => {
    // arrive[k] tags the edge that ENDS at points[k] (from points[k-1]).
    let points: Vec[] = corners.slice();
    let arrive: (NodeId | null)[] = [null, null, null, null];

    for (const other of sites) {
      if (other.id === site.id || points.length === 0) continue;
      const nx = other.p.x - site.p.x;
      const ny = other.p.y - site.p.y;
      const mx = (site.p.x + other.p.x) / 2;
      const my = (site.p.y + other.p.y) / 2;
      const side = (v: Vec) => (v.x - mx) * nx + (v.y - my) * ny; // <= 0 is site's side
      const cross = (a: Vec, b: Vec): Vec => {
        const fa = side(a);
        const fb = side(b);
        const t = fa / (fa - fb);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      };

      const outPts: Vec[] = [];
      const outArrive: (NodeId | null)[] = [];
      for (let k = 0; k < points.length; k++) {
        const a = points[(k - 1 + points.length) % points.length]!;
        const b = points[k]!;
        const tag = arrive[k] ?? null;
        const inA = side(a) <= 0;
        const inB = side(b) <= 0;
        if (inA && inB) {
          outPts.push(b);
          outArrive.push(tag);
        } else if (inA && !inB) {
          outPts.push(cross(a, b));
          outArrive.push(tag);
        } else if (!inA && inB) {
          outPts.push(cross(a, b));
          outArrive.push(other.id);
          outPts.push(b);
          outArrive.push(tag);
        }
      }
      points = outPts;
      arrive = outArrive;
    }

    // Re-key from "edge arriving at k" to "edge leaving k".
    const neighbour = points.map((_, k) => arrive[(k + 1) % points.length] ?? null);
    return { nodeId: site.id, points, neighbour };
  });
}

export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * The borders between territory cells of different sectors, each emitted
 * once. `wall` marks the East Berlin border — any boundary with RED on
 * exactly one side — which the board draws as the Wall.
 */
export function sectorBorders(
  map: MapDefinition,
  cells: readonly TerritoryCell[],
): { readonly wall: Segment[]; readonly district: Segment[] } {
  const sectorOf = new Map(map.nodes.map((n) => [n.id as string, n.sector]));
  const wall: Segment[] = [];
  const district: Segment[] = [];
  for (const cell of cells) {
    const mine = sectorOf.get(cell.nodeId as string);
    cell.points.forEach((p, k) => {
      const other = cell.neighbour[k];
      if (!other || (cell.nodeId as string) > (other as string)) return;
      const theirs = sectorOf.get(other as string);
      if (!mine || !theirs || mine === theirs) return;
      const q = cell.points[(k + 1) % cell.points.length]!;
      const seg = { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
      if ((mine === 'RED') !== (theirs === 'RED')) wall.push(seg);
      else district.push(seg);
    });
  }
  return { wall, district };
}

/** A cell polygon as an SVG `points` attribute. */
export function polygonPoints(points: readonly Vec[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

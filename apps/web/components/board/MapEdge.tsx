import type { EdgeType, MapNode as MapNodeType } from '@berlin/shared';
import { edgePath, projectNode } from '../../lib/board.js';

export interface MapEdgeProps {
  from: MapNodeType;
  to: MapNodeType;
  type: EdgeType;
}

/** Offsets the straight segment perpendicular to itself, in viewBox units —
 *  used for the CHECKPOINT double line, which must read as two parallel
 *  strokes rather than one thicker one (docs/GAME_DESIGN.md §3.1). */
function offsetSegment(from: MapNodeType, to: MapNodeType, offset: number): string {
  const a = projectNode(from);
  const b = projectNode(to);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * offset;
  const oy = (dx / len) * offset;
  return `M ${a.cx + ox} ${a.cy + oy} L ${b.cx + ox} ${b.cy + oy}`;
}

/** A gentle arc for U-Bahn tunnels, so a tunnel that runs parallel to a
 *  street never hides under it — and so tunnels read as "underground". */
function tunnelArc(from: MapNodeType, to: MapNodeType): string {
  const a = projectNode(from);
  const b = projectNode(to);
  // Canonical direction, so the arc bows the same way whichever node
  // listed the edge first.
  const [p, q] = (a.cx - b.cx || a.cy - b.cy) <= 0 ? [a, b] : [b, a];
  const mx = (p.cx + q.cx) / 2;
  const my = (p.cy + q.cy) / 2;
  const dx = q.cx - p.cx;
  const dy = q.cy - p.cy;
  const bow = 0.14;
  return `M ${p.cx} ${p.cy} Q ${mx - dy * bow} ${my + dx * bow} ${q.cx} ${q.cy}`;
}

/**
 * Styled by Edge.type only, each distinguishable in greyscale:
 * street — a cased road; tunnel — a dashed U-Bahn arc; checkpoint — a
 * double line with a red-and-white barrier at its midpoint.
 */
export function MapEdge({ from, to, type }: MapEdgeProps) {
  if (type === 'TUNNEL') {
    return (
      <path
        d={tunnelArc(from, to)}
        fill="none"
        style={{ stroke: 'var(--color-sector-green)' }}
        strokeWidth={0.5}
        strokeDasharray="1.3 0.8"
        strokeLinecap="round"
        data-edge="tunnel"
      />
    );
  }

  if (type === 'CHECKPOINT') {
    const a = projectNode(from);
    const b = projectNode(to);
    const mx = (a.cx + b.cx) / 2;
    const my = (a.cy + b.cy) / 2;
    const angle = (Math.atan2(b.cy - a.cy, b.cx - a.cx) * 180) / Math.PI;
    return (
      <g data-edge="checkpoint">
        <path d={offsetSegment(from, to, 0.55)} style={{ stroke: 'var(--color-ink)' }} strokeWidth={0.28} fill="none" />
        <path d={offsetSegment(from, to, -0.55)} style={{ stroke: 'var(--color-ink)' }} strokeWidth={0.28} fill="none" />
        {/* The barrier: a striped boom across the road. */}
        <g transform={`translate(${mx} ${my}) rotate(${angle + 90})`}>
          <rect x={-1.7} y={-0.4} width={3.4} height={0.8} rx={0.15} style={{ fill: 'var(--color-paper)', stroke: 'var(--color-stamp)' }} strokeWidth={0.18} />
          <rect x={-1.05} y={-0.4} width={0.7} height={0.8} style={{ fill: 'var(--color-stamp)' }} />
          <rect x={0.35} y={-0.4} width={0.7} height={0.8} style={{ fill: 'var(--color-stamp)' }} />
        </g>
      </g>
    );
  }

  const d = edgePath(from, to);
  return (
    <g data-edge="street">
      <path d={d} style={{ stroke: 'var(--color-ink-muted)' }} strokeOpacity={0.6} strokeWidth={1.25} fill="none" strokeLinecap="round" />
      <path d={d} style={{ stroke: 'var(--color-paper)' }} strokeWidth={0.72} fill="none" strokeLinecap="round" />
    </g>
  );
}

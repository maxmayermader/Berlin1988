import type { EdgeType, MapNode as MapNodeType } from '@berlin/shared';
import { edgePath, projectNode } from '../../lib/board.js';

export interface MapEdgeProps {
  from: MapNodeType;
  to: MapNodeType;
  type: EdgeType;
}

const STROKE = '#e2e8f0';

/** Offsets edgePath's straight segment perpendicular to itself, in viewBox
 *  units — used only to draw the CHECKPOINT double-line, which must read as
 *  two parallel strokes rather than one thicker one (docs/GAME_DESIGN.md
 *  §3.1: the wall's checkpoints are visually distinct from a plain street). */
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

/**
 * Styles by Edge.type only — street (solid), tunnel (dashed), checkpoint
 * (double line) — each distinguishable in greyscale, never by color alone.
 */
export function MapEdge({ from, to, type }: MapEdgeProps) {
  if (type === 'CHECKPOINT') {
    return (
      <g>
        <path d={offsetSegment(from, to, 0.6)} stroke={STROKE} strokeWidth={0.5} fill="none" />
        <path d={offsetSegment(from, to, -0.6)} stroke={STROKE} strokeWidth={0.5} fill="none" />
      </g>
    );
  }

  return (
    <path
      d={edgePath(from, to)}
      stroke={STROKE}
      strokeWidth={0.6}
      fill="none"
      strokeDasharray={type === 'TUNNEL' ? '2 1.5' : undefined}
    />
  );
}

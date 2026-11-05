import type { MapDefinition, NodeId } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';
import type { AgentPlan, PlannedMark } from '../../lib/plannedPaths.js';
import { ARROW_IDS } from './BoardDefs.js';

export interface PlanOverlayProps {
  map: MapDefinition;
  plans: readonly AgentPlan[];
}

const AGENT_INK = ['var(--color-agent-1)', 'var(--color-agent-2)'] as const;
const AGENT_ARROW = [ARROW_IDS.agent1, ARROW_IDS.agent2] as const;

/**
 * ORDER-08: the viewer's composed orders drawn on the map — routes as pencil
 * lines with arrowheads, operations as marks on their targets.
 *
 * Draft vs locked is the "optimistic preview vs server truth" distinction
 * (apps/web/components/CLAUDE.md): a draft is a dashed pencil line; once the
 * room acknowledges the order it is inked solid.
 */
export function PlanOverlay({ map, plans }: PlanOverlayProps) {
  const at = (id: NodeId) => {
    const node = map.nodes.find((n) => n.id === id);
    return node ? projectNode(node) : null;
  };

  return (
    <g pointerEvents="none" aria-hidden="true">
      {plans.map((plan) => {
        const ink = AGENT_INK[plan.agentIndex % 2]!;
        const arrow = AGENT_ARROW[plan.agentIndex % 2]!;
        const dash = plan.status === 'draft' ? '1.1 0.7' : undefined;
        const width = plan.status === 'draft' ? 0.7 : 0.9;
        return (
          <g key={plan.agentId as string} data-plan-status={plan.status}>
            {plan.marks.map((mark, i) => (
              <Mark key={i} mark={mark} at={at} ink={ink} arrow={arrow} dash={dash} width={width} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

interface MarkProps {
  mark: PlannedMark;
  at: (id: NodeId) => { cx: number; cy: number } | null;
  ink: string;
  arrow: string;
  dash: string | undefined;
  width: number;
}

/** Pull a segment's endpoint back from a node centre so the arrowhead
 *  lands on the node's rim rather than under its label. */
function trimmed(a: { cx: number; cy: number }, b: { cx: number; cy: number }, start: number, end: number) {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x1: a.cx + (dx / len) * start,
    y1: a.cy + (dy / len) * start,
    x2: b.cx - (dx / len) * end,
    y2: b.cy - (dy / len) * end,
  };
}

function SlotBadge({ x, y, ink, slot }: { x: number; y: number; ink: string; slot: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={1.15} style={{ fill: 'var(--color-paper)', stroke: ink }} strokeWidth={0.3} />
      <text y={0.5} textAnchor="middle" fontSize={1.4} fontWeight={700} style={{ fill: ink }}>
        {slot + 1}
      </text>
    </g>
  );
}

function Mark({ mark, at, ink, arrow, dash, width }: MarkProps) {
  switch (mark.kind) {
    case 'route': {
      const pts = mark.nodes.map(at).filter((p): p is { cx: number; cy: number } => p !== null);
      if (pts.length < 2) return null;
      const segments = pts.slice(1).map((p, i) => trimmed(pts[i]!, p, i === 0 ? 2.6 : 0.4, i === pts.length - 2 ? 3.4 : 0.4));
      const last = segments[segments.length - 1]!;
      const mid = { x: (last.x1 + last.x2) / 2, y: (last.y1 + last.y2) / 2 };
      return (
        <g>
          {segments.map((s, i) => (
            <line
              key={i}
              {...s}
              style={{ stroke: ink }}
              strokeWidth={width}
              strokeDasharray={dash}
              strokeLinecap="round"
              markerEnd={i === segments.length - 1 ? `url(#${arrow})` : undefined}
            />
          ))}
          <SlotBadge x={mid.x} y={mid.y} ink={ink} slot={mark.slot} />
        </g>
      );
    }
    case 'strike':
    case 'wiretap':
    case 'decoy': {
      const from = at(mark.from);
      const to = at(mark.target);
      if (!from || !to) return null;
      const color = mark.kind === 'strike' ? 'var(--color-stamp)' : ink;
      const s = mark.from === mark.target ? null : trimmed(from, to, 2.6, 3.6);
      return (
        <g>
          {s && (
            <line {...s} style={{ stroke: color }} strokeWidth={width * 0.85} strokeDasharray="0.35 0.6" strokeLinecap="round" />
          )}
          {mark.kind === 'strike' && (
            <g style={{ stroke: color }} strokeWidth={0.6} fill="none">
              <circle cx={to.cx} cy={to.cy} r={3.2} strokeDasharray={dash} />
              <line x1={to.cx - 4.6} y1={to.cy} x2={to.cx + 4.6} y2={to.cy} />
              <line x1={to.cx} y1={to.cy - 4.6} x2={to.cx} y2={to.cy + 4.6} />
            </g>
          )}
          {mark.kind === 'wiretap' && (
            <g style={{ stroke: color }} strokeWidth={0.42} fill="none" strokeDasharray={dash}>
              <path d={`M ${to.cx - 2.6} ${to.cy - 2.2} A 3.4 3.4 0 0 1 ${to.cx + 2.6} ${to.cy - 2.2}`} />
              <path d={`M ${to.cx - 3.6} ${to.cy - 3.1} A 4.8 4.8 0 0 1 ${to.cx + 3.6} ${to.cy - 3.1}`} />
            </g>
          )}
          {mark.kind === 'decoy' && (
            <circle cx={to.cx} cy={to.cy} r={3.4} fill="none" style={{ stroke: color }} strokeWidth={0.45} strokeDasharray="0.4 0.5" />
          )}
          <SlotBadge x={to.cx + 3.4} y={to.cy + 2.6} ink={color} slot={mark.slot} />
        </g>
      );
    }
    case 'hold':
      // Holding changes nothing on the map; the order form says it.
      return null;
    case 'ambush':
    case 'safehouse':
    case 'bribe': {
      const p = at(mark.at);
      if (!p) return null;
      const label = { ambush: 'TRAP', safehouse: 'SAFE', bribe: 'BRIBE' }[mark.kind];
      const x = p.cx - 3.6;
      const y = p.cy + 1.6 + mark.slot * 2.2;
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x={-3.4} y={-1.05} width={3.4} height={1.6} rx={0.3} style={{ fill: 'var(--color-paper)', stroke: ink }} strokeWidth={0.22} strokeDasharray={dash} />
          <text x={-1.7} y={0.28} textAnchor="middle" fontSize={1.05} fontWeight={700} style={{ fill: ink }}>
            {mark.slot + 1}·{label}
          </text>
        </g>
      );
    }
  }
}

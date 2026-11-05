import type { MapDefinition, NodeId } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';

export interface TargetOverlayProps {
  map: MapDefinition;
  /** Legal non-lethal targets for the slot being composed (move, sprint,
   *  wiretap, decoy). */
  legalTargets: readonly NodeId[];
  /** Legal STRIKE targets — drawn as a red reticle, since a strike is lethal. */
  strikeTargets?: readonly NodeId[];
}

/**
 * Highlights exactly the targets it is handed as props — it computes no
 * legality itself. Legality comes from legalOrders(), one layer up
 * (lib/actionMenu.ts via app/match/[code]/page.tsx), so there is exactly one
 * place in the client that decides what a player may do.
 *
 * Purely visual: pointer events pass through to the node's own hit target,
 * which is what a click actually selects.
 */
export function TargetOverlay({ map, legalTargets, strikeTargets = [] }: TargetOverlayProps) {
  const strikeSet = new Set<string>(strikeTargets as readonly string[]);
  const all = [...legalTargets, ...strikeTargets.filter((t) => !legalTargets.includes(t))];

  return (
    <g pointerEvents="none">
      {all.map((id) => {
        const node = map.nodes.find((n) => n.id === id);
        if (!node) return null;
        const { cx, cy } = projectNode(node);
        const isStrike = strikeSet.has(id as string);
        if (isStrike) {
          return (
            <g key={id as string} data-legal-target="strike" style={{ stroke: 'var(--color-stamp)' }} strokeWidth={0.5} fill="none">
              <circle cx={cx} cy={cy} r={3.9} style={{ fill: 'var(--color-stamp)' }} fillOpacity={0.1} />
              <line x1={cx - 5.2} y1={cy} x2={cx - 2.6} y2={cy} />
              <line x1={cx + 2.6} y1={cy} x2={cx + 5.2} y2={cy} />
              <line x1={cx} y1={cy - 5.2} x2={cx} y2={cy - 2.6} />
              <line x1={cx} y1={cy + 2.6} x2={cx} y2={cy + 5.2} />
            </g>
          );
        }
        return (
          <circle
            key={id as string}
            cx={cx}
            cy={cy}
            r={3.9}
            style={{ stroke: 'var(--color-accent)', fill: 'var(--color-accent)' }}
            fillOpacity={0.1}
            strokeWidth={0.55}
            strokeDasharray="1.1 0.6"
            data-legal-target="move"
          />
        );
      })}
    </g>
  );
}

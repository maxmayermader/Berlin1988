import type { MapDefinition, NodeId } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';

export interface TargetOverlayProps {
  map: MapDefinition;
  /** Legal MOVE targets for the slot being composed. */
  legalTargets: readonly NodeId[];
  /** Legal STRIKE targets for the slot being composed — highlighted in the
   *  destructive color, since a strike is lethal (01-UI-SPEC.md Color). */
  strikeTargets?: readonly NodeId[];
}

/**
 * Highlights exactly the targets it is handed as props — it computes no
 * legality itself. Legality comes from legalOrders(), one layer up
 * (components/orders/OrderComposer.tsx and app/match/[code]/page.tsx), so
 * there is exactly one place in the client that decides what a player may
 * do.
 */
export function TargetOverlay({ map, legalTargets, strikeTargets = [] }: TargetOverlayProps) {
  const strikeSet = new Set<string>(strikeTargets as readonly string[]);

  return (
    <>
      {legalTargets.map((id) => {
        const node = map.nodes.find((n) => n.id === id);
        if (!node) return null;
        const { cx, cy } = projectNode(node);
        const isStrike = strikeSet.has(id as string);
        return (
          <circle
            key={id as string}
            cx={cx}
            cy={cy}
            r={3.6}
            fill="none"
            stroke={isStrike ? '#dc2626' : '#2563eb'}
            strokeWidth={0.6}
            data-legal-target={isStrike ? 'strike' : 'move'}
          />
        );
      })}
    </>
  );
}

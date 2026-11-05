import type { Decoy, MapDefinition, NodeId, Trap } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';
import { NODE_SIZE } from './MapNode.js';

export interface OwnAssetsProps {
  map: MapDefinition;
  /** The viewer's own safehouse — `view.self.safehouse`. A rival's is never
   *  in the data (apps/web/components/board/CLAUDE.md rule 2). */
  safehouse: NodeId | null;
  /** The viewer's own live ambushes — `view.self.traps`. */
  traps: readonly Trap[];
  /** The viewer's own live decoys — `view.self.decoys`. */
  decoys: readonly Decoy[];
}

/**
 * INTEL-01 on the map: the things only the viewer knows about — their
 * safehouse, their traps and their decoys — drawn in the viewer's own blue
 * ink and labelled, so private knowledge never looks like public fact.
 */
export function OwnAssets({ map, safehouse, traps, decoys }: OwnAssetsProps) {
  const at = (id: NodeId) => {
    const node = map.nodes.find((n) => n.id === id);
    return node ? projectNode(node) : null;
  };
  const h = NODE_SIZE / 2;
  const house = safehouse ? at(safehouse) : null;

  return (
    <g pointerEvents="none">
      {house && (
        <g transform={`translate(${house.cx + h + 0.6} ${house.cy + 0.4})`} data-own-asset="safehouse">
          <title>Your safehouse</title>
          <path
            d="M 0 1.6 L 0 0.2 L 1.3 -1 L 2.6 0.2 L 2.6 1.6 Z"
            style={{ fill: 'var(--color-accent)', stroke: 'var(--color-paper)' }}
            strokeWidth={0.22}
            strokeLinejoin="round"
          />
          <rect x={1} y={0.55} width={0.6} height={1.05} style={{ fill: 'var(--color-paper)' }} />
        </g>
      )}

      {traps.map((trap) => {
        const p = at(trap.nodeId);
        if (!p) return null;
        return (
          <g key={trap.id} transform={`translate(${p.cx - h - 3.2} ${p.cy + 1.4})`} data-own-asset="trap">
            <title>{`Your ambush — live through round ${trap.expiresAfterRound}`}</title>
            <rect x={-0.3} y={-1.1} width={3.4} height={2.2} rx={0.35} style={{ fill: 'var(--color-paper)', stroke: 'var(--color-stamp)' }} strokeWidth={0.22} />
            {/* Jaws of a snare. */}
            <path d="M 0.2 0.5 L 0.65 -0.5 L 1.1 0.5 L 1.55 -0.5 L 2 0.5 L 2.45 -0.5 L 2.8 0.5" fill="none" style={{ stroke: 'var(--color-stamp)' }} strokeWidth={0.26} strokeLinejoin="round" />
            <text x={1.4} y={2.35} textAnchor="middle" fontSize={1.15} fontWeight={700} style={{ fill: 'var(--color-stamp)' }} className="board-label">
              →R{trap.expiresAfterRound}
            </text>
          </g>
        );
      })}

      {decoys.map((decoy) => {
        const p = at(decoy.nodeId);
        if (!p) return null;
        return (
          <g key={decoy.id} data-own-asset="decoy">
            <title>{`Your decoy — live through round ${decoy.expiresAfterRound}`}</title>
            <circle cx={p.cx - h - 2.3} cy={p.cy - 0.3} r={1.5} style={{ fill: 'var(--color-paper)', stroke: 'var(--color-accent)' }} strokeWidth={0.3} strokeDasharray="0.45 0.4" />
            <text x={p.cx - h - 2.3} y={p.cy + 0.22} textAnchor="middle" fontSize={1.4} fontWeight={700} style={{ fill: 'var(--color-accent)' }}>
              D
            </text>
          </g>
        );
      })}
    </g>
  );
}

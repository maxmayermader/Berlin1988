import type { AgentId, MapDefinition, NodeId, Sector } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';
import { SECTOR_COLOR } from '../../lib/sectors.js';

/** One of the viewer's own agents as the board draws it. */
export interface TokenSpec {
  readonly id: AgentId;
  /** 0-based position in the viewer's agent list — printed as "1" / "2". */
  readonly index: number;
  readonly nodeId: NodeId;
  readonly alive: boolean;
  readonly dossiers: number;
}

export interface AgentTokenProps {
  /** Always a list — apps/web/components/CLAUDE.md: "Two agents is the
   *  default, one is a setting." There is no prop here, and can be no prop,
   *  for another player's agent: OpponentPublicInfo has no field that could
   *  supply one. */
  tokens: readonly TokenSpec[];
  map: MapDefinition;
  faction: Sector;
  activeAgentId: AgentId | null;
}

/**
 * The viewer's agents: a numbered pin in their faction's ink standing over
 * the node, a dossier tally when carrying, and a ring on the agent being
 * ordered. A token burned mid-replay stays on the board as a struck-out
 * pin until the replay ends, so the player sees where it fell.
 */
export function AgentToken({ tokens, map, faction, activeAgentId }: AgentTokenProps) {
  // Co-located tokens fan out so a 2-agent player's pins never overlap.
  const perNode = new Map<string, TokenSpec[]>();
  for (const token of tokens) {
    const list = perNode.get(token.nodeId as string) ?? [];
    list.push(token);
    perNode.set(token.nodeId as string, list);
  }

  return (
    <g>
      {tokens.map((token) => {
        const node = map.nodes.find((n) => n.id === token.nodeId);
        if (!node) return null;
        const { cx, cy } = projectNode(node);
        const group = perNode.get(token.nodeId as string) ?? [token];
        const slot = group.indexOf(token);
        const offset = slot * 3.6 - ((group.length - 1) * 3.6) / 2;
        const x = cx + offset;
        const y = cy - 5.6;
        const active = token.id === activeAgentId && token.alive;

        return (
          <g
            key={token.id as string}
            className="agent-token"
            style={{ transform: `translate(${x}px, ${y}px)` }}
            data-agent-token={token.index + 1}
            data-alive={token.alive}
          >
            {/* The pin's needle down to the node. */}
            <line x1={0} y1={1.6} x2={cx - x} y2={cy - y - 2} style={{ stroke: 'var(--color-ink)' }} strokeWidth={0.28} />
            {active && (
              <circle r={2.7} fill="none" style={{ stroke: 'var(--color-accent)' }} strokeWidth={0.4} strokeDasharray="0.8 0.45" />
            )}
            <circle
              r={1.95}
              style={{
                fill: token.alive ? SECTOR_COLOR[faction] : 'var(--color-paper-2)',
                stroke: token.alive ? 'var(--color-paper)' : 'var(--color-ink-muted)',
              }}
              strokeWidth={0.42}
            />
            <text
              y={0.72}
              textAnchor="middle"
              fontSize={2.1}
              fontWeight={700}
              style={{ fill: token.alive ? 'var(--color-paper)' : 'var(--color-ink-muted)' }}
            >
              {token.index + 1}
            </text>
            {!token.alive && (
              <g style={{ stroke: 'var(--color-stamp)' }} strokeWidth={0.5} strokeLinecap="round">
                <line x1={-1.6} y1={-1.6} x2={1.6} y2={1.6} />
                <line x1={1.6} y1={-1.6} x2={-1.6} y2={1.6} />
              </g>
            )}
            {token.alive && token.dossiers > 0 && (
              <g transform="translate(1.7 -1.9)">
                <rect x={-0.15} y={-0.95} width={2.3} height={1.9} rx={0.25} style={{ fill: 'var(--color-manila)', stroke: 'var(--color-ink)' }} strokeWidth={0.16} />
                <text x={1} y={0.55} textAnchor="middle" fontSize={1.4} fontWeight={700} style={{ fill: 'var(--color-ink)' }}>
                  {token.dossiers}
                </text>
              </g>
            )}
            <title>{`Your agent ${token.index + 1}${token.alive ? '' : ' (burned)'}${token.dossiers > 0 ? `, carrying ${token.dossiers} dossier${token.dossiers === 1 ? '' : 's'}` : ''}`}</title>
          </g>
        );
      })}
    </g>
  );
}

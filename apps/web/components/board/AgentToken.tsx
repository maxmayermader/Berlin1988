import type { AgentState, MapDefinition } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';

export interface AgentTokenProps {
  /** Always a list — apps/web/components/CLAUDE.md: "Two agents is the
   *  default, one is a setting. Every board and order component takes a
   *  list of agents, never a singleton." There is no prop here, and can be
   *  no prop, for another player's agent: OpponentPublicInfo has no field
   *  that could supply one. */
  agents: readonly AgentState[];
  map: MapDefinition;
}

export function AgentToken({ agents, map }: AgentTokenProps) {
  const living = agents.filter((a) => a.alive);

  return (
    <>
      {living.map((agent, i) => {
        const node = map.nodes.find((n) => n.id === agent.nodeId);
        if (!node) return null;
        const { cx, cy } = projectNode(node);
        // Offsets multiple co-located tokens so a 2-agent player's tokens
        // don't fully overlap on the same node.
        const offset = i * 1.8 - ((living.length - 1) * 1.8) / 2;
        return (
          <circle
            key={agent.id}
            cx={cx + offset}
            cy={cy - 3.2}
            r={1.1}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={0.3}
          />
        );
      })}
    </>
  );
}

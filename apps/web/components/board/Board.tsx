'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import type { AgentState, EdgeType, MapDefinition, MapNode as MapNodeType, NodeId, NodeRuntime } from '@berlin/shared';
import { type Direction, traversalOrder } from '../../lib/board.js';
import { AgentToken } from './AgentToken.js';
import { MapEdge } from './MapEdge.js';
import { MapNode } from './MapNode.js';
import { TargetOverlay } from './TargetOverlay.js';

export interface BoardProps {
  map: MapDefinition;
  /** The viewer's own living agents — never an opponent's. */
  agents: readonly AgentState[];
  visibleNodes: Readonly<Record<string, NodeRuntime>>;
  activeBlockades: Readonly<Record<string, number>>;
  selectedNodeId: NodeId | null;
  legalTargets: readonly NodeId[];
  strikeTargets?: readonly NodeId[];
  onSelectNode: (nodeId: NodeId) => void;
}

interface RenderEdge {
  readonly key: string;
  readonly from: MapNodeType;
  readonly to: MapNodeType;
  readonly type: EdgeType;
}

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * The inline-SVG viewport. Lays out every node and edge from `map` alone —
 * no branch on map.id anywhere in this file (apps/web/components/board/CLAUDE.md
 * rule 1), so a map with a different node count renders correctly with zero
 * changes here.
 */
export function Board({
  map,
  agents,
  visibleNodes,
  activeBlockades,
  selectedNodeId,
  legalTargets,
  strikeTargets = [],
  onSelectNode,
}: BoardProps) {
  const [focusedNodeId, setFocusedNodeId] = useState<NodeId | null>(map.nodes[0]?.id ?? null);

  // Each edge is declared once per direction in map data; de-duplicated to
  // one <MapEdge> per connection regardless of which node listed it first.
  const edges = useMemo<RenderEdge[]>(() => {
    const seen = new Set<string>();
    const out: RenderEdge[] = [];
    for (const node of map.nodes) {
      for (const edge of node.edges) {
        const pairKey = [node.id, edge.to].sort().join('::');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const to = map.nodes.find((n) => n.id === edge.to);
        if (!to) continue;
        out.push({ key: pairKey, from: node, to, type: edge.type });
      }
    }
    return out;
  }, [map]);

  // Arrow keys traverse to an adjacent node, Enter selects it — the whole
  // board is playable without a mouse (rule 5).
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!focusedNodeId) return;
    const direction = KEY_TO_DIRECTION[event.key];
    if (direction) {
      event.preventDefault();
      const next = traversalOrder(map, focusedNodeId, direction);
      if (next) setFocusedNodeId(next);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectNode(focusedNodeId);
    }
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Berlin map"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="h-auto w-full"
    >
      {edges.map((e) => (
        <MapEdge key={e.key} from={e.from} to={e.to} type={e.type} />
      ))}

      <TargetOverlay map={map} legalTargets={legalTargets} strikeTargets={strikeTargets} />

      {map.nodes.map((node) => (
        <MapNode
          key={node.id as string}
          node={node}
          runtime={visibleNodes[node.id as string]}
          blockadedUntil={activeBlockades[node.id as string]}
          selected={node.id === selectedNodeId}
          focused={node.id === focusedNodeId}
          onSelect={() => {
            setFocusedNodeId(node.id);
            onSelectNode(node.id);
          }}
        />
      ))}

      <AgentToken agents={agents} map={map} />
    </svg>
  );
}

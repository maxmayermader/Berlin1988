'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type {
  AgentId,
  BlockadeEvent,
  Decoy,
  EdgeType,
  MapDefinition,
  MapNode as MapNodeType,
  NodeId,
  NodeRuntime,
  Sector,
  Trap,
} from '@berlin/shared';
import { type Direction, HIT_TARGET_PX, fitViewBox, traversalOrder } from '../../lib/board.js';
import type { AgentPlan } from '../../lib/plannedPaths.js';
import type { ReplayBeat } from '../../lib/replay.js';
import { AgentToken, type TokenSpec } from './AgentToken.js';
import { BeatOverlay } from './BeatOverlay.js';
import { BoardDefs } from './BoardDefs.js';
import { MapEdge } from './MapEdge.js';
import { MapNode } from './MapNode.js';
import { OwnAssets } from './OwnAssets.js';
import { PlanOverlay } from './PlanOverlay.js';
import { TargetOverlay } from './TargetOverlay.js';
import { Territory } from './Territory.js';

export interface BoardProps {
  map: MapDefinition;
  /** The viewer's own agents as tokens — never an opponent's. */
  tokens: readonly TokenSpec[];
  /** The viewer's faction, which inks their tokens. */
  faction: Sector;
  activeAgentId?: AgentId | null;
  visibleNodes: Readonly<Record<string, NodeRuntime>>;
  activeBlockades: Readonly<Record<string, number>>;
  /** Public, announced-in-advance blockades. */
  announcedBlockades?: readonly BlockadeEvent[];
  /** The current round, so only still-upcoming announcements are drawn. */
  round?: number;
  selfId?: string | null;
  /** The viewer's own hidden state — theirs alone, from `view.self`. */
  safehouse?: NodeId | null;
  traps?: readonly Trap[];
  decoys?: readonly Decoy[];
  selectedNodeId: NodeId | null;
  legalTargets: readonly NodeId[];
  strikeTargets?: readonly NodeId[];
  /** ORDER-08: composed orders drawn on the map. */
  plans?: readonly AgentPlan[];
  /** A node or sector the player picked from the signals log. */
  highlight?: { readonly nodeId: NodeId | null; readonly sector: Sector | null } | null;
  /** REPLAY-01: the beat currently on screen, with its reveal index. */
  beat?: ReplayBeat | null;
  beatKey?: number;
  onSelectNode: (nodeId: NodeId) => void;
  /** Reports the node under the pointer or keyboard focus, for the inspector. */
  onInspectNode?: (nodeId: NodeId | null) => void;
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
 * The board is a fixed viewBox rendered responsively; there is no live
 * measurement of its on-screen pixel size here. ASSUMED_BOARD_PX is the
 * design assumption (a typical rendered board width) used only to convert
 * the 44px minimum hit target into viewBox units.
 */
const ASSUMED_BOARD_PX = 560;

/**
 * The inline-SVG city plan. Every layer is laid out from `map` alone — no
 * branch on map.id anywhere in this folder (apps/web/components/board/
 * CLAUDE.md rule 1) — so a map with a different node count renders
 * correctly with zero changes here.
 *
 * Layers, back to front: sheet grid → territory and the Wall → roads →
 * composed plans → legal targets → nodes → the viewer's own assets → the
 * replay beat → the viewer's agents.
 */
export function Board({
  map,
  tokens,
  faction,
  activeAgentId = null,
  visibleNodes,
  activeBlockades,
  announcedBlockades = [],
  round = 0,
  selfId = null,
  safehouse = null,
  traps = [],
  decoys = [],
  selectedNodeId,
  legalTargets,
  strikeTargets = [],
  plans = [],
  highlight = null,
  beat = null,
  beatKey = 0,
  onSelectNode,
  onInspectNode,
}: BoardProps) {
  // Keyboard focus starts at the viewer's own agent (selectedNodeId) rather
  // than map.nodes[0] — arrow-key traversal is meaningless if it starts from
  // an arbitrary array position instead of where the agent actually is.
  const [focusedNodeId, setFocusedNodeId] = useState<NodeId | null>(
    () => selectedNodeId ?? map.nodes[0]?.id ?? null,
  );
  const [hasKeyboardFocus, setHasKeyboardFocus] = useState(false);

  // Re-anchor focus when the active agent's node changes — a round
  // resolving a move, or the player switching to their other agent.
  useEffect(() => {
    if (selectedNodeId) setFocusedNodeId(selectedNodeId);
  }, [selectedNodeId]);

  const box = useMemo(() => fitViewBox(map), [map]);
  const hitRadius = (HIT_TARGET_PX / 2 / ASSUMED_BOARD_PX) * box.w;

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
    // Tunnels underneath streets underneath checkpoints.
    const order: Record<EdgeType, number> = { TUNNEL: 0, STREET: 1, CHECKPOINT: 2 };
    return out.sort((a, b) => order[a.type] - order[b.type]);
  }, [map]);

  const closing = useMemo(() => {
    const out = new Map<string, number>();
    for (const b of announcedBlockades) {
      if (b.round < round) continue;
      const prior = out.get(b.nodeId as string);
      if (prior === undefined || b.round < prior) out.set(b.nodeId as string, b.round);
    }
    return out;
  }, [announcedBlockades, round]);

  // Arrow keys traverse to an adjacent node, Enter selects it — the whole
  // board is playable without a mouse (rule 5).
  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!focusedNodeId) return;
    const direction = KEY_TO_DIRECTION[event.key];
    if (direction) {
      event.preventDefault();
      const next = traversalOrder(map, focusedNodeId, direction);
      if (next) {
        setFocusedNodeId(next);
        onInspectNode?.(next);
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectNode(focusedNodeId);
    }
  }

  const highlightNode = highlight?.nodeId
    ? map.nodes.find((n) => n.id === highlight.nodeId) ?? null
    : null;

  return (
    <svg
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label="Berlin map"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setHasKeyboardFocus(true);
        onInspectNode?.(focusedNodeId);
      }}
      onBlur={() => setHasKeyboardFocus(false)}
      className="block h-auto w-full font-type select-none"
    >
      <BoardDefs />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#sheet-grid)" />

      <Territory map={map} box={box} highlightSector={highlight?.sector ?? null} />

      {edges.map((e) => (
        <MapEdge key={e.key} from={e.from} to={e.to} type={e.type} />
      ))}

      <PlanOverlay map={map} plans={plans} />
      <TargetOverlay map={map} legalTargets={legalTargets} strikeTargets={strikeTargets} />

      {highlightNode && (
        <g pointerEvents="none">
          <circle cx={highlightNode.x} cy={highlightNode.y} r={5.2} style={{ fill: 'var(--color-highlight)' }} fillOpacity={0.22} />
          <circle
            cx={highlightNode.x}
            cy={highlightNode.y}
            r={5.2}
            fill="none"
            style={{ stroke: 'var(--color-highlight)' }}
            strokeWidth={0.7}
            className="beat-pulse animate-beat-pulse"
          />
        </g>
      )}

      {map.nodes.map((node) => (
        <MapNode
          key={node.id as string}
          node={node}
          runtime={visibleNodes[node.id as string]}
          blockadedUntil={activeBlockades[node.id as string]}
          closesInRound={closing.get(node.id as string)}
          selfId={selfId}
          faction={faction}
          selected={node.id === selectedNodeId}
          focused={hasKeyboardFocus && node.id === focusedNodeId}
          hitRadius={hitRadius}
          onSelect={() => {
            setFocusedNodeId(node.id);
            onSelectNode(node.id);
          }}
          onHover={onInspectNode ? (on) => onInspectNode(on ? node.id : null) : undefined}
        />
      ))}

      <OwnAssets map={map} safehouse={safehouse} traps={traps} decoys={decoys} />

      <BeatOverlay map={map} beat={beat} beatKey={beatKey} />

      <AgentToken tokens={tokens} map={map} faction={faction} activeAgentId={activeAgentId} />

      <Compass x={box.x + box.w - 5} y={box.y + 5.5} />
    </svg>
  );
}

function Compass({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true" pointerEvents="none">
      <circle r={2.6} fill="none" style={{ stroke: 'var(--color-ink-muted)' }} strokeWidth={0.18} />
      <path d="M 0 -2.3 L 0.75 0.4 L 0 0 L -0.75 0.4 Z" style={{ fill: 'var(--color-ink)' }} />
      <path d="M 0 2.3 L 0.75 -0.4 L 0 0 L -0.75 -0.4 Z" style={{ fill: 'var(--color-ink-muted)' }} fillOpacity={0.5} />
      <text y={-3.2} textAnchor="middle" fontSize={1.6} fontWeight={700} style={{ fill: 'var(--color-ink)' }}>
        N
      </text>
    </g>
  );
}

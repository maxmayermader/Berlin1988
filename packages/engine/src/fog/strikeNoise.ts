import type { GameState, NodeId, PlayerId, ResolutionEvent, Sector } from '@berlin/shared';
import { areAdjacent } from '../graph.js';

/**
 * A strike is loud, but not equally loud everywhere (docs/GAME_DESIGN.md §5.2).
 *
 *   adjacent agents  → the exact node
 *   everyone else    → the sector only
 *   silenced         → nothing at all, unless you were adjacent
 *
 * Grading happens here, per recipient. The resolution pipeline logs the whole
 * truth and never pre-redacts, so there is exactly one place to audit.
 */
export type StrikeAudibility = 'EXACT' | 'VICINITY' | 'SILENT';

export function audibilityFor(
  state: GameState,
  ev: Extract<ResolutionEvent, { type: 'STRIKE_FIRED' }>,
  viewer: PlayerId,
): StrikeAudibility {
  if (ev.playerId === viewer) return 'EXACT';

  const p = state.players[viewer as string];
  if (!p) return 'SILENT';

  // "Standing right there" beats a silencer — you see the muzzle flash.
  const nearby = p.agents.some(
    (a) =>
      a.alive &&
      (a.nodeId === ev.from ||
        a.nodeId === ev.target ||
        areAdjacent(state.map, a.nodeId, ev.from) ||
        areAdjacent(state.map, a.nodeId, ev.target)),
  );
  if (nearby) return 'EXACT';

  return ev.silenced ? 'SILENT' : 'VICINITY';
}

export function strikeSectorOf(state: GameState, node: NodeId): Sector {
  const n = state.map.nodes.find((x) => x.id === node);
  return n ? n.sector : 'GOLD';
}

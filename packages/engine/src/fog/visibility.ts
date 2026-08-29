import type { GameState, NodeId, PlayerId } from '@berlin/shared';
import { neighbours } from '../graph.js';

/**
 * Which nodes a player can see: their own agents' nodes, everything adjacent to
 * them, and any informant they own. In 2v2, teammates share all of it.
 */
export function visibleNodesFor(state: GameState, viewer: PlayerId): Set<string> {
  const out = new Set<string>();
  const me = state.players[viewer as string];
  if (!me) return out;

  const sharing: PlayerId[] = [viewer];
  if (me.team !== null) {
    for (const id of state.playerOrder) {
      const p = state.players[id as string]!;
      if (p.id !== viewer && p.team === me.team) sharing.push(p.id);
    }
  }

  for (const pid of sharing) {
    const p = state.players[pid as string]!;
    for (const a of p.agents) {
      if (!a.alive) continue;
      out.add(a.nodeId as string);
      for (const n of neighbours(state.map, a.nodeId)) out.add(n as string);
    }
  }

  for (const [nodeKey, runtime] of Object.entries(state.nodes)) {
    if (runtime.informantOwner && sharing.includes(runtime.informantOwner)) {
      out.add(nodeKey);
    }
  }

  return out;
}

/** Players whose vision this viewer shares — themselves, plus teammates. */
export function visionGroup(state: GameState, viewer: PlayerId): PlayerId[] {
  const me = state.players[viewer as string];
  if (!me) return [];
  if (me.team === null) return [viewer];
  return state.playerOrder.filter(
    (id) => state.players[id as string]!.team === me.team,
  );
}

/** Every live rival agent standing on a node. Used for scan resolution. */
export function agentsAt(state: GameState, node: NodeId, exclude?: PlayerId) {
  const out = [];
  for (const id of state.playerOrder) {
    const p = state.players[id as string]!;
    if (exclude && p.id === exclude) continue;
    for (const a of p.agents) {
      if (a.alive && a.nodeId === node) out.push(a);
    }
  }
  return out;
}

import type { PlayerView } from '@berlin/shared';
import { neighbours } from '@berlin/engine';

/**
 * A second, much coarser belief layer: where are the things that kill me?
 *
 * Agents die permanently, so a bot that wanders into traps is not "easy" —
 * it is broken. But traps and rival safehouses are invisible, so they have to
 * be INFERRED from public evidence:
 *
 *   - A rival's Burn Track shows Strike uses that produced no reported burn
 *     → they set ambushes somewhere.
 *   - A rival keeps operating around one area → their safehouse is probably
 *     there, and contested nodes are auto-lost on ground they own.
 *
 * It should be wrong often. That is what makes a good trap satisfying to land.
 * If you ever find yourself reaching for GameState to make this accurate, stop.
 */
export interface ThreatMap {
  /** node → rough P(a rival trap is here). */
  readonly trap: Map<string, number>;
  /** node → rough P(a rival safehouse is here). */
  readonly safehouse: Map<string, number>;
}

export function createThreatMap(): ThreatMap {
  return { trap: new Map(), safehouse: new Map() };
}

export function updateThreatMap(tm: ThreatMap, view: PlayerView): void {
  // Traps decay: they expire, and stale suspicion makes a bot too timid.
  for (const [k, v] of tm.trap) {
    const decayed = v * 0.75;
    if (decayed < 0.02) tm.trap.delete(k);
    else tm.trap.set(k, decayed);
  }
  for (const [k, v] of tm.safehouse) tm.safehouse.set(k, v * 0.97);

  const round = view.round;

  // How many STRIKE cards did each rival play recently that produced no burn?
  // Those were almost certainly ambushes.
  let suspectedTraps = 0;
  for (const opp of view.opponents) {
    const track = view.burnTracks[opp.id as string] ?? [];
    const recentStrikes = track.filter(
      (e) => e.icon === 'STRIKE' && e.kind === 'ACTIVE' && e.round >= round - 3,
    ).length;
    const knownKills = view.lastRound.filter(
      (e) => e.type === 'AGENT_BURNED' && e.byPlayerId === opp.id,
    ).length;
    suspectedTraps += Math.max(0, recentStrikes - knownKills);
  }

  if (suspectedTraps > 0) {
    // Traps go where traffic goes: high-degree junctions and dossier nodes.
    const spread = suspectedTraps * 0.12;
    for (const n of view.map.nodes) {
      const degree = n.edges.length;
      const runtime = view.visibleNodes[n.id as string];
      const juicy = (runtime?.dossiers ?? 0) > 0 ? 1.6 : 1;
      const weight = (degree / 4) * juicy * spread;
      tm.trap.set(n.id as string, Math.min(0.6, (tm.trap.get(n.id as string) ?? 0) + weight * 0.1));
    }
  }

  // Safehouse inference. An agent that survives an ambush and reappears
  // somewhere specific has just shown you its safehouse or a U-Bahn station —
  // and a bot can rule out the station.
  for (const ev of view.lastRound) {
    if (ev.type !== 'AMBUSH_TRIGGERED' || !ev.escaped || !ev.escapedTo) continue;
    if (ev.victimId === view.self.id) continue;
    const dest = view.map.nodes.find((n) => n.id === ev.escapedTo);
    if (dest && !dest.isUBahnStation) {
      bump(tm.safehouse, ev.escapedTo as string, 0.5);
    }
  }

  // Repeated activity in one area also hints at home ground.
  for (const sig of view.signals) {
    if (sig.kind !== 'STRIKE_EXACT' && sig.kind !== 'INFORMANT_REPORT') continue;
    if (!sig.nodeId) continue;
    bump(tm.safehouse, sig.nodeId as string, 0.04);
    for (const n of neighbours(view.map, sig.nodeId)) {
      bump(tm.safehouse, n as string, 0.02);
    }
  }
}

/** Confirmed knowledge beats inference: a triggered trap was really there. */
export function confirmTrap(tm: ThreatMap, node: string): void {
  tm.trap.set(node, 0.9);
}

export function trapRisk(tm: ThreatMap, node: string): number {
  return tm.trap.get(node) ?? 0;
}

export function safehouseRisk(tm: ThreatMap, node: string): number {
  return Math.min(1, tm.safehouse.get(node) ?? 0);
}

function bump(m: Map<string, number>, k: string, v: number): void {
  m.set(k, Math.min(1, (m.get(k) ?? 0) + v));
}

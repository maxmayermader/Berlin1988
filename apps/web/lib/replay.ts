import type { AgentState, NodeId, ResolutionEvent } from '@berlin/shared';

/**
 * REPLAY-01..04: the round, played back on the map one beat per event.
 *
 * Fog discipline (REPLAY-03, .planning/ROADMAP.md Phase 9): every beat is a
 * pure function of ONE event the viewer already holds in `view.lastRound`,
 * which `filterEvents()` reduced to their entitlement before it left the
 * room. Nothing here reads another event to fill a gap, interpolates an
 * opponent path, or consults any other part of the view — so a beat can
 * only ever point at nodes the event itself names. Opponent movement is
 * never animated because `AGENT_MOVED` only survives fog for the viewer's
 * own agents; there is nothing to animate it from.
 *
 * Pure: no React, no motion library, importable from a node vitest run.
 */

/** docs/GAME_DESIGN.md §7.2 — the published resolution order, so the
 *  replay teaches the priority rules by showing which step each beat is. */
export type ReplayStep =
  | 'Round opens'
  | 'Passives & safehouses'
  | 'Ambushes set'
  | 'Decoys placed'
  | 'Movement'
  | 'Ambush triggers'
  | 'Blockade sweep'
  | 'Bribes'
  | 'Wiretaps'
  | 'Strikes'
  | 'Contested nodes'
  | 'Casualties'
  | 'Dossiers & extraction'
  | 'Ledger'
  | 'Upkeep';

export type BeatTone = 'neutral' | 'move' | 'danger' | 'intel' | 'success' | 'warning';

export type BeatGlyph =
  | 'none'
  | 'move'
  | 'strike'
  | 'burn'
  | 'trap'
  | 'contest'
  | 'blockade'
  | 'dossier'
  | 'extract'
  | 'wiretap'
  | 'informant'
  | 'safehouse'
  | 'decoy'
  | 'checkpoint';

export interface ReplayBeat {
  readonly step: ReplayStep;
  readonly tone: BeatTone;
  readonly glyph: BeatGlyph;
  /** Nodes to ring on the map, in emphasis order (primary first). */
  readonly nodes: readonly NodeId[];
  /** A directed arrow — own movement, a strike's line of fire, an escape. */
  readonly arrow: { readonly from: NodeId; readonly to: NodeId } | null;
}

const QUIET: ReplayBeat = { step: 'Ledger', tone: 'neutral', glyph: 'none', nodes: [], arrow: null };

export function beatFor(event: ResolutionEvent): ReplayBeat {
  switch (event.type) {
    case 'ROUND_START':
      return { ...QUIET, step: 'Round opens' };
    case 'SAFEHOUSE_PLACED':
      return { step: 'Passives & safehouses', tone: 'success', glyph: 'safehouse', nodes: [event.nodeId], arrow: null };
    case 'PASSIVE_FIRED':
      return { ...QUIET, step: 'Passives & safehouses', tone: 'intel' };
    case 'AMBUSH_SET':
      return { step: 'Ambushes set', tone: 'warning', glyph: 'trap', nodes: [event.nodeId], arrow: null };
    case 'DECOY_PLACED':
      return { step: 'Decoys placed', tone: 'intel', glyph: 'decoy', nodes: [event.nodeId], arrow: null };
    case 'AGENT_MOVED':
      return {
        step: 'Movement',
        tone: 'move',
        glyph: 'move',
        nodes: [event.to],
        arrow: { from: event.from, to: event.to },
      };
    case 'CHECKPOINT_CROSSED':
      return { step: 'Movement', tone: 'warning', glyph: 'checkpoint', nodes: [event.nodeId], arrow: null };
    case 'AMBUSH_TRIGGERED':
      return {
        step: 'Ambush triggers',
        tone: 'danger',
        glyph: 'trap',
        nodes: event.escapedTo ? [event.nodeId, event.escapedTo] : [event.nodeId],
        arrow: event.escaped && event.escapedTo ? { from: event.nodeId, to: event.escapedTo } : null,
      };
    case 'BLOCKADE_ANNOUNCED':
      return { step: 'Blockade sweep', tone: 'warning', glyph: 'blockade', nodes: [event.nodeId], arrow: null };
    case 'BLOCKADE_CLOSED':
      return { step: 'Blockade sweep', tone: 'danger', glyph: 'blockade', nodes: [event.nodeId], arrow: null };
    case 'BLOCKADE_LIFTED':
      return { step: 'Blockade sweep', tone: 'neutral', glyph: 'blockade', nodes: [event.nodeId], arrow: null };
    case 'BLOCKADE_CAUGHT':
      return {
        step: 'Blockade sweep',
        tone: 'danger',
        glyph: event.survived ? 'blockade' : 'burn',
        nodes: event.relocatedTo ? [event.nodeId, event.relocatedTo] : [event.nodeId],
        arrow: event.survived && event.relocatedTo ? { from: event.nodeId, to: event.relocatedTo } : null,
      };
    case 'INFORMANT_CLAIMED':
      return { step: 'Bribes', tone: 'intel', glyph: 'informant', nodes: [event.nodeId], arrow: null };
    case 'WIRETAP_RESULT':
      return {
        step: 'Wiretaps',
        tone: 'intel',
        glyph: 'wiretap',
        // The target first, then every node the tap reported on.
        nodes: [event.target, ...event.results.map((r) => r.nodeId).filter((n) => n !== event.target)],
        arrow: null,
      };
    case 'STRIKE_FIRED':
      return {
        step: 'Strikes',
        tone: 'danger',
        glyph: 'strike',
        nodes: [event.target],
        arrow: event.from !== event.target ? { from: event.from, to: event.target } : null,
      };
    case 'CONTEST':
      return { step: 'Contested nodes', tone: 'warning', glyph: 'contest', nodes: [event.nodeId], arrow: null };
    case 'AGENT_BURNED':
      return { step: 'Casualties', tone: 'danger', glyph: 'burn', nodes: [event.nodeId], arrow: null };
    case 'DOSSIER_TAKEN':
      return { step: 'Dossiers & extraction', tone: 'success', glyph: 'dossier', nodes: [event.nodeId], arrow: null };
    case 'DOSSIER_SPAWNED':
      return { step: 'Dossiers & extraction', tone: 'intel', glyph: 'dossier', nodes: [event.nodeId], arrow: null };
    case 'EXTRACTION':
      return { step: 'Dossiers & extraction', tone: 'success', glyph: 'extract', nodes: [event.nodeId], arrow: null };
    case 'CARD_PLAYED':
    case 'SILENCER_BOUGHT':
    case 'INTEL_GAINED':
      return QUIET;
    case 'PLAYER_ELIMINATED':
      return { ...QUIET, step: 'Upkeep', tone: 'danger' };
    case 'MATCH_ENDED':
      return { ...QUIET, step: 'Upkeep', tone: 'success' };
  }
}

/** One own agent as the replay shows it at a given beat. */
export interface ReplayAgent {
  readonly agent: AgentState;
  readonly nodeId: NodeId;
  readonly alive: boolean;
}

/**
 * Where the viewer's OWN agents stand after the first `revealed` events —
 * so a Move beat slides the token rather than the token having already
 * teleported to its post-round node when the replay opens.
 *
 * Reads only events carrying one of the viewer's own agent ids. Opponent
 * agent ids never survive fog (`filterEvents()` nulls them), so even a
 * malformed caller cannot make this trace someone else.
 */
export function ownAgentsAt(
  agents: readonly AgentState[],
  log: readonly ResolutionEvent[],
  revealed: number,
): ReplayAgent[] {
  return agents.flatMap((agent) => {
    const id = agent.id as string;
    const mine = log.filter((e) => agentIdOf(e) === id);
    const diedThisRound = mine.some(isDeath);
    // An agent already dead before this round has nothing to replay.
    if (!agent.alive && !diedThisRound) return [];

    // Where the agent stood when the round opened: the origin of its first
    // relocation (a move, or a strike — the striker advances onto its
    // target, packages/engine/src/resolution/strikes.ts).
    const first = mine.find((e) => e.type === 'AGENT_MOVED' || e.type === 'STRIKE_FIRED');
    let nodeId =
      first?.type === 'AGENT_MOVED' || first?.type === 'STRIKE_FIRED' ? first.from : agent.nodeId;
    let alive = true;

    for (const event of log.slice(0, revealed)) {
      if (agentIdOf(event) !== id) continue;
      if (event.type === 'AGENT_MOVED') nodeId = event.to;
      else if (event.type === 'STRIKE_FIRED') nodeId = event.target;
      else if (event.type === 'BLOCKADE_CAUGHT' && event.relocatedTo) nodeId = event.relocatedTo;
      else if (event.type === 'AMBUSH_TRIGGERED' && event.escaped && event.escapedTo) nodeId = event.escapedTo;
      if (isDeath(event)) {
        alive = false;
        if (event.type === 'AGENT_BURNED' || event.type === 'BLOCKADE_CAUGHT') nodeId = event.nodeId;
      }
    }

    // Once the whole round is revealed, the view's own position is the
    // truth. It also covers the one relocation no event names an agent for:
    // a GREEN decoy swapping places with its owner (DECOY_PLACED carries
    // only the player), which is placed before movement.
    if (revealed >= log.length && alive && agent.alive) nodeId = agent.nodeId;
    return [{ agent, nodeId, alive }];
  });
}

function agentIdOf(event: ResolutionEvent): string | null {
  switch (event.type) {
    case 'AGENT_MOVED':
    case 'BLOCKADE_CAUGHT':
    case 'AGENT_BURNED':
    case 'DOSSIER_TAKEN':
    case 'EXTRACTION':
    case 'STRIKE_FIRED':
      return event.agentId as string | null;
    case 'AMBUSH_TRIGGERED':
      return event.victimAgentId as string | null;
    default:
      return null;
  }
}

function isDeath(event: ResolutionEvent): boolean {
  return (
    event.type === 'AGENT_BURNED' ||
    (event.type === 'BLOCKADE_CAUGHT' && !event.survived)
  );
}

/** Milliseconds per beat while auto-playing — docs/ARCHITECTURE.md §9's
 *  ~700ms 🔧, nudged up because each beat also carries a line of prose. */
export const BEAT_MS = 950;

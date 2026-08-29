import type {
  AgentState,
  GameState,
  NodeId,
  PlayerId,
  InterceptFact,
  ResolutionEvent,
  Signal,
} from '@berlin/shared';
import { distance, neighbours, nodeOf } from '../graph.js';
import { audibilityFor, strikeSectorOf } from './strikeNoise.js';
import { visionGroup } from './visibility.js';
import { nextInt } from '../rng.js';

/**
 * The per-round information drip (docs/GAME_DESIGN.md §10).
 *
 * Complete fog is a design trap — with nothing to work on, players flail for
 * five rounds and the game feels like guessing. This is the controlled leak
 * that gives deduction something to chew on from round one.
 *
 * Called once at Upkeep, so it consumes RNG deterministically and projectView
 * stays a pure read.
 */
export function generateSignals(
  state: GameState,
  log: readonly ResolutionEvent[],
): Record<string, Signal[]> {
  const out: Record<string, Signal[]> = {};
  const round = state.round;

  for (const viewerId of state.playerOrder) {
    const viewer = state.players[viewerId as string]!;
    const group = new Set(visionGroup(state, viewerId).map((p) => p as string));
    const sigs: Signal[] = [];

    const myAgents = viewer.agents.filter((a) => a.alive);
    const myNodes = new Set(myAgents.map((a) => a.nodeId as string));
    const adjacent = new Set<string>();
    for (const a of myAgents) {
      for (const n of neighbours(state.map, a.nodeId)) adjacent.add(n as string);
    }

    // 1. Adjacency chatter — someone passed nearby. No identity, no direction.
    //    Tunnel movement is exempt; that is what tunnels are for.
    const chattered = new Set<string>();
    for (const ev of log) {
      if (ev.type !== 'AGENT_MOVED' || ev.viaTunnel) continue;
      if (group.has(ev.playerId as string)) continue;
      for (const n of [ev.from, ev.to]) {
        if (adjacent.has(n as string) && !chattered.has(n as string)) {
          chattered.add(n as string);
          sigs.push({
            kind: 'CHATTER',
            round,
            nodeId: n,
            sector: null,
            playerId: null,
            text: `Movement reported near ${nodeOf(state.map, n).name}.`,
          });
        }
      }
    }

    // 2. "You are not alone" — the strongest single signal in the game.
    for (const a of myAgents) {
      const rival = anyRivalAt(state, a.nodeId, group);
      if (rival) {
        sigs.push({
          kind: 'NOT_ALONE',
          round,
          nodeId: a.nodeId,
          sector: null,
          playerId: null,
          text: `You are not alone at ${nodeOf(state.map, a.nodeId).name}.`,
        });
      }
    }

    // 3. Informant reports — nodes you bought tell you who walked in.
    for (const ev of log) {
      if (ev.type !== 'AGENT_MOVED') continue;
      if (group.has(ev.playerId as string)) continue;
      const runtime = state.nodes[ev.to as string];
      if (runtime?.informantOwner && group.has(runtime.informantOwner as string)) {
        sigs.push({
          kind: 'INFORMANT_REPORT',
          round,
          nodeId: ev.to,
          sector: null,
          playerId: null,
          text: `Your informant at ${nodeOf(state.map, ev.to).name} reports an arrival.`,
        });
      }
    }

    // 4. One Radio Intercept. Guaranteed true, deliberately vague.
    const intercept = rollIntercept(state, viewerId, log);
    if (intercept) sigs.push(intercept);

    // 5-7. Public events.
    for (const ev of log) {
      if (ev.type === 'CHECKPOINT_CROSSED' && !ev.silent) {
        sigs.push({
          kind: 'BORDER_CROSSING',
          round,
          nodeId: ev.nodeId,
          sector: null,
          playerId: null,
          text: `Someone crossed at ${nodeOf(state.map, ev.nodeId).name}.`,
        });
      } else if (ev.type === 'DOSSIER_TAKEN') {
        sigs.push({
          kind: 'DOSSIER_TAKEN',
          round,
          nodeId: ev.nodeId,
          sector: null,
          playerId: ev.playerId,
          text: `A dossier was taken at ${nodeOf(state.map, ev.nodeId).name}.`,
        });
      } else if (ev.type === 'AGENT_BURNED') {
        sigs.push({
          kind: 'BURN',
          round,
          nodeId: ev.nodeId,
          sector: null,
          playerId: ev.playerId,
          text: `${state.players[ev.playerId as string]?.name ?? 'An agent'} lost an agent at ${nodeOf(state.map, ev.nodeId).name}.`,
        });
      } else if (ev.type === 'STRIKE_FIRED') {
        const audibility = audibilityFor(state, ev, viewerId);
        if (audibility === 'EXACT') {
          sigs.push({
            kind: 'STRIKE_EXACT',
            round,
            nodeId: ev.target,
            sector: ev.sector,
            playerId: null,
            text: `Gunfire at ${nodeOf(state.map, ev.target).name}.`,
          });
        } else if (audibility === 'VICINITY') {
          sigs.push({
            kind: 'STRIKE_VICINITY',
            round,
            nodeId: null,
            sector: ev.sector,
            playerId: null,
            text: `Gunfire somewhere in the ${ev.sector} sector.`,
          });
        }
      } else if (ev.type === 'BLOCKADE_ANNOUNCED') {
        sigs.push({
          kind: 'BLOCKADE_ANNOUNCED',
          round,
          nodeId: ev.nodeId,
          sector: null,
          playerId: null,
          text: `Kontrolle announced at ${nodeOf(state.map, ev.nodeId).name} next round.`,
        });
      } else if (ev.type === 'BLOCKADE_CLOSED') {
        sigs.push({
          kind: 'BLOCKADE_ACTIVE',
          round,
          nodeId: ev.nodeId,
          sector: null,
          playerId: null,
          text: `${nodeOf(state.map, ev.nodeId).name} is sealed.`,
        });
      }
    }

    void myNodes;
    out[viewerId as string] = sigs;
  }

  return out;
}

function anyRivalAt(
  state: GameState,
  node: NodeId,
  group: Set<string>,
): boolean {
  for (const id of state.playerOrder) {
    if (group.has(id as string)) continue;
    const p = state.players[id as string]!;
    if (p.agents.some((a) => a.alive && a.nodeId === node)) return true;
  }
  return false;
}

/**
 * Pick one rival agent and one TRUE statement about it.
 *
 * Intercepts are never false. A bot's particle filter and a human's deduction
 * both treat them as hard constraints, so a lie would poison both.
 */
function rollIntercept(
  state: GameState,
  viewerId: PlayerId,
  log: readonly ResolutionEvent[],
): Signal | null {
  const group = new Set(visionGroup(state, viewerId).map((p) => p as string));
  const targets: AgentState[] = [];
  for (const id of state.playerOrder) {
    if (group.has(id as string)) continue;
    const p = state.players[id as string]!;
    for (const a of p.agents) if (a.alive) targets.push(a);
  }
  // Always draw, even with no targets, so the stream stays aligned.
  const pickIdx = nextInt(state.rng, Math.max(1, targets.length));
  if (targets.length === 0) {
    nextInt(state.rng, 1);
    return null;
  }
  const agent = targets[pickIdx]!;

  const moved = log.some((e) => e.type === 'AGENT_MOVED' && e.agentId === agent.id);
  const owner = state.players[agent.playerId as string]!;
  const here = nodeOf(state.map, agent.nodeId);

  // Every statement here must be TRUE. Bots and humans both treat intercepts as
  // hard constraints, so a lie would poison both.
  const statements: { text: string; fact: InterceptFact }[] = [
    {
      text: `An agent is operating in a ${here.sector} sector.`,
      fact: { kind: 'IN_SECTOR', sector: here.sector },
    },
  ];

  const anchor = pickAnchor(state, agent.nodeId);
  if (anchor) {
    statements.push({
      text: `An agent is within two nodes of ${nodeOf(state.map, anchor).name}.`,
      fact: { kind: 'NEAR_NODE', nodeId: anchor, within: 2 },
    });
  }
  if (!moved) {
    statements.push({
      text: 'An agent did not move last round.',
      fact: { kind: 'DID_NOT_MOVE' },
    });
  }
  if (agent.dossiers > 0) {
    statements.push({
      text: 'An agent is carrying a dossier.',
      fact: { kind: 'CARRYING_DOSSIER' },
    });
  }
  if (owner.hasCrossedCheckpoint) {
    statements.push({
      text: 'An agent has crossed a checkpoint this match.',
      fact: { kind: 'CROSSED_CHECKPOINT' },
    });
  }

  const chosen = statements[nextInt(state.rng, statements.length)]!;
  return {
    kind: 'RADIO_INTERCEPT',
    round: state.round,
    nodeId: null,
    sector: null,
    playerId: null,
    text: `Radio intercept: ${chosen.text}`,
    intercept: chosen.fact,
  };
}

/** A landmark within 2 hops, chosen deterministically so the text is stable. */
function pickAnchor(state: GameState, from: NodeId): NodeId | null {
  const candidates = state.map.nodes
    .filter((n) => n.id !== from && distance(state.map, from, n.id) <= 2)
    .map((n) => n.id)
    .sort();
  return candidates[0] ?? null;
}

import type { AgentState, NodeId, PlayerId } from '@berlin/shared';
import {
  burnAgent,
  claim,
  collect,
  emit,
  firePassive,
  grant,
  isBlocked,
  playCard,
  posOf,
  spend,
  type RoundContext,
} from './ctx.js';
import { getCard, isActive } from '../content/cards.js';
import { areAdjacent, nodeOf } from '../graph.js';

/**
 * Step 9 — strikes, resolved after scans and after movement.
 *
 * The rule the whole game hangs on: a strike ALWAYS reveals the striker, hit or
 * miss. The only way to remove someone is to tell people where you are. Range
 * is 1 for the same reason — a sniper who could hit anything from anywhere
 * would have no reason ever to be found.
 *
 * The striking agent advances into the target node as part of the action.
 * Grading of who hears the shot happens in fog/strikeNoise.ts, not here.
 */
export function stepStrikes(ctx: RoundContext): void {
  const state = ctx.state;

  for (const { player, agent, action } of collect(ctx, 'STRIKE')) {
    if (!agent.alive || ctx.burned.has(agent.id as string)) continue;

    const card = getCard(action.cardId);
    if (!isActive(card)) continue;

    const from = agent.nodeId;
    const target = action.target;

    // Range is checked against the POST-movement position. Composing a move
    // after a strike can put the target out of reach — the shot fizzles, and
    // the Intel and cooldown are spent anyway.
    if (target !== from && !areAdjacent(state.map, from, target)) continue;
    if (isBlocked(state, target as string)) continue;
    if (!spend(player, card.intelCost)) continue;

    playCard(ctx, player, action.cardId);

    const silenced = player.silencers > 0;
    if (silenced) player.silencers -= 1;

    agent.nodeId = target;
    ctx.positions.set(agent.id as string, target as string);

    emit(ctx, {
      type: 'STRIKE_FIRED',
      playerId: player.id,
      agentId: agent.id,
      from,
      target,
      sector: nodeOf(state.map, target).sector,
      silenced,
    });

    claim(ctx, target as string, player.id);

    // Contested nodes are decided later, by the ladder. A plain strike into an
    // uncontested node resolves right here.
    if ((ctx.claims.get(target as string)?.size ?? 0) > 1) continue;

    resolveHits(ctx, player.id, target, card.sector === 'RED');
  }
}

/** Burn every rival agent standing on the target. Decoys absorb the shot. */
export function resolveHits(
  ctx: RoundContext,
  attacker: PlayerId,
  target: NodeId,
  redSynergy: boolean,
): boolean {
  const state = ctx.state;
  let hit = false;

  const decoy = state.decoys.find(
    (d) => d.nodeId === target && d.ownerId !== attacker,
  );
  if (decoy) {
    // Hitting a decoy is worse than missing: it dies, you are revealed as
    // normal, and its owner learns your position a round before anyone else.
    state.decoys = state.decoys.filter((d) => d.id !== decoy.id);
    return false;
  }

  const victims: AgentState[] = [];
  for (const pid of state.playerOrder) {
    if (pid === attacker) continue;
    const p = state.players[pid as string]!;
    if (sameTeam(ctx, attacker, p.id)) continue;
    for (const a of p.agents) {
      if (a.alive && !ctx.burned.has(a.id as string) && posOf(ctx, a) === (target as string)) {
        victims.push(a);
      }
    }
  }

  for (const victim of victims) {
    const owner = state.players[victim.playerId as string]!;
    if (firePassive(ctx, owner, 'GHOST_PROTOCOL')) continue;
    burnAgent(ctx, victim, 'STRIKE', attacker);
    hit = true;
  }

  // RED synergy: a confirmed burn refunds 2 Intel.
  if (hit && redSynergy) {
    const p = state.players[attacker as string]!;
    const gained = grant(p, 2, state.ruleset.intelCap);
    if (gained > 0) emit(ctx, { type: 'INTEL_GAINED', playerId: p.id, amount: gained });
  }

  return hit;
}

function sameTeam(ctx: RoundContext, a: PlayerId, b: PlayerId): boolean {
  if (!ctx.state.settings.teams) return false;
  const pa = ctx.state.players[a as string];
  const pb = ctx.state.players[b as string];
  return pa?.team !== null && pa?.team === pb?.team;
}

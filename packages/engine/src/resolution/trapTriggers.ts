import type { NodeId } from '@berlin/shared';
import { burnAgent, emit, firePassive, isBlocked, type RoundContext } from './ctx.js';
import { nearestRefuge } from '../graph.js';

/**
 * Step 5 — anyone who walked into a trap.
 *
 * The ladder, in order:
 *   1. Both players trapped this node → sealed. Escapes do not function.
 *   2. Victim holds Dead Drop → survives, relocates to their safehouse or the
 *      nearest U-Bahn station, whichever is closer.
 *   3. Otherwise burned. Permanently — agents never respawn.
 *
 * A node contested by a trap AND a strike is left alone here; the contested
 * step decides those, because that is where the safehouse tiebreak lives.
 */
export function stepTrapTriggers(ctx: RoundContext): void {
  const state = ctx.state;

  for (const pid of state.playerOrder) {
    const player = state.players[pid as string]!;
    if (player.eliminated) continue;

    for (const agent of player.agents) {
      if (!agent.alive || ctx.burned.has(agent.id as string)) continue;

      const here = agent.nodeId;
      const trapsHere = state.traps.filter((t) => t.nodeId === here);
      const rivalTraps = trapsHere.filter((t) => t.ownerId !== player.id);
      if (rivalTraps.length === 0) continue;

      // Contested nodes are the contested step's business, not ours.
      if ((ctx.claims.get(here as string)?.size ?? 0) > 1) continue;

      const owner = rivalTraps[0]!;
      const sealed = trapsHere.some((t) => t.ownerId === player.id);

      let escaped = false;
      let escapedTo: NodeId | null = null;

      if (!sealed && firePassive(ctx, player, 'DEAD_DROP')) {
        escapedTo = nearestRefuge(state.map, here, player.safehouse, (n) =>
          isBlocked(state, n as string),
        );
        if (escapedTo) {
          escaped = true;
          agent.nodeId = escapedTo;
          ctx.positions.set(agent.id as string, escapedTo as string);
          agent.actionPenalty = state.ruleset.actionsPerAgent;
        }
      }

      emit(ctx, {
        type: 'AMBUSH_TRIGGERED',
        ownerId: owner.ownerId,
        victimId: player.id,
        victimAgentId: agent.id,
        nodeId: here,
        escaped,
        escapedTo,
        sealed,
      });

      // Traps are consumed when they trigger, whether or not they killed.
      state.traps = state.traps.filter((t) => t.nodeId !== here);

      if (!escaped) burnAgent(ctx, agent, 'AMBUSH', owner.ownerId);
    }
  }
}

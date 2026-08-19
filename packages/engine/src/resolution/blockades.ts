import { burnAgent, emit, firePassive, type RoundContext } from './ctx.js';
import { neighbours } from '../graph.js';

/**
 * Step 6 — the city closes.
 *
 * Blockades are pre-rolled at match creation, which is what makes the Kontrolle
 * Schedule passive implementable. An agent caught in a closing node is burned
 * outright, unless their own safehouse is there (they know the ground) or they
 * hold Tunnel Rat. Survivors relocate and lose an action next round.
 *
 * Blockades don't negotiate. This is the pressure valve that stops long matches
 * from stalling into mutual hiding.
 */
export function stepBlockades(ctx: RoundContext): void {
  const state = ctx.state;
  const rs = state.ruleset;

  // Lift anything whose time is up.
  for (const [key, node] of Object.entries(state.nodes)) {
    if (node.blockadedUntil !== null && node.blockadedUntil <= state.round) {
      node.blockadedUntil = null;
      emit(ctx, { type: 'BLOCKADE_LIFTED', nodeId: key as never });
    }
  }

  // Announce next round's closures.
  for (const b of state.blockadeSchedule) {
    if (b.announced && b.round === state.round + 1) {
      emit(ctx, { type: 'BLOCKADE_ANNOUNCED', nodeId: b.nodeId, round: b.round });
    }
  }

  const closing = state.blockadeSchedule.filter((b) => b.round === state.round);
  for (const b of closing) {
    const node = state.nodes[b.nodeId as string];
    if (!node) continue;

    // Never seal the last dossier on the board — that would make the objective
    // unreachable through no decision of anyone's.
    const totalDossiers = Object.values(state.nodes).reduce((n, x) => n + x.dossiers, 0);
    if (node.dossiers > 0 && node.dossiers === totalDossiers) continue;

    node.blockadedUntil = state.round + b.duration;
    emit(ctx, { type: 'BLOCKADE_CLOSED', nodeId: b.nodeId, until: node.blockadedUntil });

    for (const pid of state.playerOrder) {
      const player = state.players[pid as string]!;
      if (player.eliminated) continue;

      for (const agent of player.agents) {
        if (!agent.alive || ctx.burned.has(agent.id as string)) continue;
        if (agent.nodeId !== b.nodeId) continue;

        const sheltered = player.safehouse === b.nodeId;
        const rat = !sheltered && firePassive(ctx, player, 'TUNNEL_RAT');

        if (!sheltered && !rat) {
          emit(ctx, {
            type: 'BLOCKADE_CAUGHT',
            playerId: player.id,
            agentId: agent.id,
            nodeId: b.nodeId,
            survived: false,
            relocatedTo: null,
          });
          burnAgent(ctx, agent, 'BLOCKADE', null);
          continue;
        }

        const exit = neighbours(state.map, b.nodeId)
          .filter((n) => {
            const rt = state.nodes[n as string];
            return rt && (rt.blockadedUntil === null || rt.blockadedUntil <= state.round);
          })
          .sort()[0];

        if (exit) {
          agent.nodeId = exit;
          ctx.positions.set(agent.id as string, exit as string);
        }
        agent.actionPenalty = rs.blockadeActionPenalty;

        emit(ctx, {
          type: 'BLOCKADE_CAUGHT',
          playerId: player.id,
          agentId: agent.id,
          nodeId: b.nodeId,
          survived: true,
          relocatedTo: exit ?? null,
        });
      }
    }

    // A sealed node destroys whatever was hidden inside it.
    state.traps = state.traps.filter((t) => t.nodeId !== b.nodeId);
    state.decoys = state.decoys.filter((d) => d.nodeId !== b.nodeId);
  }
}

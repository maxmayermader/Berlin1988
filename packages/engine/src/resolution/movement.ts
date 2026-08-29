import type { Action, AgentState, NodeId, PlayerSecrets } from '@berlin/shared';
import { emit, isBlocked, playCard, spend, type RoundContext } from './ctx.js';
import { edgeCost } from '../costs.js';
import { getCard } from '../content/cards.js';

/**
 * Step 4 — all agents move simultaneously.
 *
 * Movement is resolved in listed order within an agent's turn (two MOVEs walk
 * two edges), but across players it is simultaneous: nobody sees anybody else's
 * destination. This is what makes "shoot where they're going, not where they
 * are" the skill ceiling of the game.
 */
export function stepMovement(ctx: RoundContext): void {
  for (const pid of ctx.state.playerOrder) {
    const player = ctx.state.players[pid as string]!;
    if (player.eliminated) continue;

    for (const agent of player.agents) {
      if (!agent.alive) continue;
      const order = ctx.state.pendingOrders[agent.id as string];
      if (!order) {
        ctx.positions.set(agent.id as string, agent.nodeId as string);
        continue;
      }

      for (const action of order.actions) {
        if (action.type === 'MOVE') applyStep(ctx, player, agent, action.to, false, false);
        else if (action.type === 'SPRINT') applySprint(ctx, player, agent, action);
      }

      ctx.positions.set(agent.id as string, agent.nodeId as string);
    }
  }
}

function applySprint(
  ctx: RoundContext,
  player: PlayerSecrets,
  agent: AgentState,
  action: Extract<Action, { type: 'SPRINT' }>,
): void {
  const rs = ctx.state.ruleset;

  if (action.cardId) {
    const card = getCard(action.cardId);
    if (card.kind !== 'ACTIVE') return;
    playCard(ctx, player, action.cardId);
  } else if (!spend(player, rs.sprintIntelCost)) {
    return;
  }

  applyStep(ctx, player, agent, action.via, true, false);
  applyStep(ctx, player, agent, action.to, true, true);
}

/** One edge. Charges tolls, records the crossing, refuses blocked nodes. */
function applyStep(
  ctx: RoundContext,
  player: PlayerSecrets,
  agent: AgentState,
  to: NodeId,
  sprint: boolean,
  _final: boolean,
): void {
  if (isBlocked(ctx.state, to as string)) return;

  const cost = edgeCost(ctx.state.map, agent.nodeId, to, player, ctx.state.ruleset);
  if (!cost) return;
  if (!spend(player, cost.intel)) return;

  const from = agent.nodeId;
  agent.nodeId = to;

  emit(ctx, {
    type: 'AGENT_MOVED',
    playerId: player.id,
    agentId: agent.id,
    from,
    to,
    viaTunnel: cost.viaTunnel,
    viaCheckpoint: cost.viaCheckpoint,
    sprint,
  });

  if (cost.viaCheckpoint) {
    player.hasCrossedCheckpoint = true;
    emit(ctx, {
      type: 'CHECKPOINT_CROSSED',
      playerId: player.id,
      nodeId: to,
      silent: cost.silentCrossing,
    });
  }
}

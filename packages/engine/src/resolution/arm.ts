import { collect, emit, playCard, spend, type RoundContext } from './ctx.js';
import { getCard, isActive } from '../content/cards.js';
import { nodeOf } from '../graph.js';

/**
 * Step 1 — safehouses placed or relocated, silencers bought.
 *
 * Note the timing: a safehouse is placed where the agent STARTS the round, not
 * where it ends up. You are designating a bolt-hole you already know, not one
 * you sprinted to. It has to exist before the contested step can test against
 * it, which is why this runs before movement.
 */
export function stepArm(ctx: RoundContext): void {
  const rs = ctx.state.ruleset;

  // Silencer purchases cost Intel but no action.
  for (const pid of ctx.state.playerOrder) {
    const p = ctx.state.players[pid as string]!;
    if (p.eliminated) continue;
    let bought = 0;
    for (const agent of p.agents) {
      const order = ctx.state.pendingOrders[agent.id as string];
      const want = order?.buySilencers ?? 0;
      for (let i = 0; i < want; i++) {
        if (p.silencers >= rs.maxSilencersHeld) break;
        if (!spend(p, rs.silencerIntelCost)) break;
        p.silencers += 1;
        bought += 1;
      }
    }
    if (bought > 0) {
      emit(ctx, { type: 'SILENCER_BOUGHT', playerId: p.id, count: bought });
    }
  }

  for (const { player, agent, action } of collect(ctx, 'SAFEHOUSE')) {
    const card = getCard(action.cardId);
    if (!isActive(card)) continue;

    // BLUE synergy: relocating in a BLUE sector costs no action. The action is
    // already spent by the time we get here, so the refund is the Intel.
    const here = nodeOf(ctx.state.map, agent.nodeId);
    const synergy = card.sector === here.sector && card.sector === 'BLUE';
    const cost = synergy ? 0 : card.intelCost;
    if (!spend(player, cost)) continue;

    player.safehouse = agent.nodeId;
    playCard(ctx, player, action.cardId);
    emit(ctx, { type: 'SAFEHOUSE_PLACED', playerId: player.id, nodeId: agent.nodeId });
  }
}

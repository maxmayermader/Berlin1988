import { collect, emit, nextId, playCard, spend, type RoundContext } from './ctx.js';
import { getCard, isActive } from '../content/cards.js';
import { distance, nodeOf } from '../graph.js';

/**
 * Step 3 — decoys placed, before movement, so they are scannable this round.
 * A decoy that could not be found until next round would not be worth 3 Intel.
 */
export function stepDecoys(ctx: RoundContext): void {
  const rs = ctx.state.ruleset;

  for (const { player, agent, action } of collect(ctx, 'DECOY')) {
    const card = getCard(action.cardId);
    if (!isActive(card)) continue;

    const active = ctx.state.decoys.filter((d) => d.ownerId === player.id).length;
    if (active >= rs.maxActiveDecoys) continue;
    if (distance(ctx.state.map, agent.nodeId, action.target) > 2) continue;
    if (!spend(player, card.intelCost)) continue;

    ctx.state.decoys.push({
      id: nextId(ctx.state, 'decoy'),
      ownerId: player.id,
      nodeId: action.target,
      expiresAfterRound: ctx.state.round + rs.decoyDurationRounds - 1,
    });

    playCard(ctx, player, action.cardId);
    emit(ctx, { type: 'DECOY_PLACED', playerId: player.id, nodeId: action.target });

    // GREEN synergy: swap places with the decoy. Placed on a GREEN node, the
    // decoy takes your old position and you take its node.
    const target = nodeOf(ctx.state.map, action.target);
    if (card.sector === 'GREEN' && target.sector === 'GREEN') {
      const from = agent.nodeId;
      agent.nodeId = action.target;
      ctx.state.decoys[ctx.state.decoys.length - 1] = {
        ...ctx.state.decoys[ctx.state.decoys.length - 1]!,
        nodeId: from,
      };
    }
  }
}

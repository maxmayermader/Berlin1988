import { collect, emit, grant, playCard, posOf, spend, type RoundContext } from './ctx.js';
import { getCard, isActive } from '../content/cards.js';
import { nodeOf } from '../graph.js';

/**
 * Step 7 — informant captures, resolved from post-movement positions.
 *
 * An informant is worth more than its Intel: it privately reports every agent
 * that enters its node, which is the steadiest deduction source in the game.
 */
export function stepBribes(ctx: RoundContext): void {
  for (const { player, agent, action } of collect(ctx, 'BRIBE')) {
    const card = getCard(action.cardId);
    if (!isActive(card)) continue;

    const nodeKey = posOf(ctx, agent);
    const mapNode = nodeOf(ctx.state.map, agent.nodeId);
    const runtime = ctx.state.nodes[nodeKey];
    if (!runtime || !mapNode.hasInformant) continue;
    if (runtime.informantOwner === player.id) continue;
    if (!spend(player, card.intelCost)) continue;

    runtime.informantOwner = player.id;
    playCard(ctx, player, action.cardId);
    emit(ctx, { type: 'INFORMANT_CLAIMED', playerId: player.id, nodeId: agent.nodeId });

    // GOLD synergy: +2 Intel immediately on capture in a GOLD sector.
    if (card.sector === 'GOLD' && mapNode.sector === 'GOLD') {
      const gained = grant(player, 2, ctx.state.ruleset.intelCap);
      if (gained > 0) {
        emit(ctx, { type: 'INTEL_GAINED', playerId: player.id, amount: gained });
      }
    }
  }
}

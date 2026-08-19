import type { NodeId } from '@berlin/shared';
import { collect, emit, firePassive, playCard, spend, type RoundContext } from './ctx.js';
import { getCard, isActive } from '../content/cards.js';
import { neighbours, nodeOf } from '../graph.js';

/**
 * Step 8 — scans, resolved AFTER movement. You find out where they arrived,
 * not where they set off from.
 *
 * A scan reports OCCUPIED or CLEAR and never names who. Decoys read as
 * OCCUPIED, which is the entire reason they cost 3 Intel.
 */
export function stepWiretaps(ctx: RoundContext): void {
  const state = ctx.state;

  for (const { player, action } of collect(ctx, 'WIRETAP')) {
    const card = getCard(action.cardId);
    if (!isActive(card)) continue;
    if (!spend(player, card.intelCost)) continue;
    playCard(ctx, player, action.cardId);

    // BLUE synergy: scanning a BLUE node also sweeps everything adjacent.
    const target = nodeOf(state.map, action.target);
    const sweep =
      card.sector === 'BLUE' && target.sector === 'BLUE'
        ? [action.target, ...neighbours(state.map, action.target)]
        : [action.target];

    const results = sweep.map((nodeId) => ({
      nodeId,
      occupied: isOccupied(ctx, nodeId, player.id),
    }));

    emit(ctx, {
      type: 'WIRETAP_RESULT',
      playerId: player.id,
      target: action.target,
      results,
    });
  }
}

/**
 * A node reads OCCUPIED if any rival agent or any rival decoy is on it.
 *
 * Counter-Surveillance fires here: the first scan that would find you returns
 * CLEAR instead. It is consumed per detection, so a BLUE sweep that catches you
 * once burns the card once.
 */
function isOccupied(ctx: RoundContext, node: NodeId, scanner: string): boolean {
  const state = ctx.state;

  for (const pid of state.playerOrder) {
    if ((pid as string) === scanner) continue;
    const p = state.players[pid as string]!;
    const found = p.agents.some((a) => a.alive && a.nodeId === node);
    if (found) {
      if (firePassive(ctx, p, 'COUNTER_SURVEILLANCE')) continue;
      return true;
    }
  }

  return state.decoys.some(
    (d) => d.nodeId === node && (d.ownerId as string) !== scanner,
  );
}

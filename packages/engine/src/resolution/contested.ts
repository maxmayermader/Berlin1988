import type { ContestMethod, NodeId, PlayerId } from '@berlin/shared';
import { burnAgent, emit, firePassive, posOf, type RoundContext } from './ctx.js';
import { next } from '../rng.js';

/**
 * Step 10 — the contested-node ladder (docs/GAME_DESIGN.md §8.4).
 *
 * A strict ORDERED ladder, not a scoring system:
 *   1. Mutual traps      → every agent on the node is burned. No escapes, no roll.
 *   2. Safehouse present → its owner wins outright.
 *   3. Neutral ground    → 50/50 from the seeded PRNG.
 *   4. K9 Unit held      → 75/25, consumed either way.
 *   5. Both hold K9      → both consumed, back to 50/50.
 *
 * DETERMINISM: rules 3-5 consume PRNG draws, and the stream must advance
 * IDENTICALLY regardless of which branch runs — otherwise two replays of the
 * same match diverge. Every contested node therefore draws exactly once, even
 * when the outcome was decided without needing the number.
 */
export function stepContested(ctx: RoundContext): void {
  const state = ctx.state;

  // Sorted so iteration order never depends on Map insertion order.
  const nodes = [...ctx.claims.entries()]
    .filter(([, players]) => players.size > 1)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  for (const [nodeKey, playerSet] of nodes) {
    const node = nodeKey as NodeId;
    const claimants = [...playerSet].sort() as PlayerId[];

    const trapOwners = new Set(
      state.traps.filter((t) => t.nodeId === node).map((t) => t.ownerId as string),
    );
    const mutualTrap = claimants.filter((c) => trapOwners.has(c as string)).length > 1;

    // Always draw, so the stream is branch-independent.
    const roll = next(state.rng);

    let winner: PlayerId | null = null;
    let method: ContestMethod;

    if (mutualTrap) {
      method = 'MUTUAL_TRAP';
    } else {
      const holder = claimants.find(
        (c) => state.players[c as string]?.safehouse === node,
      );
      if (holder) {
        winner = holder;
        method = 'SAFEHOUSE';
      } else {
        // K9 shifts the odds and is consumed either way. Both sides holding it
        // cancels out — both cards burn, and it is a coin flip again.
        const k9 = claimants.filter((c) =>
          firePassive(ctx, state.players[c as string]!, 'K9_UNIT'),
        );
        method = k9.length === 1 ? 'K9_ROLL' : 'COIN_FLIP';

        const bonus = k9.length === 1 ? state.ruleset.k9WinChanceBonus : 0;
        const favoured = k9.length === 1 ? k9[0]! : claimants[0]!;
        const other = claimants.find((c) => c !== favoured) ?? claimants[0]!;
        winner = roll < 0.5 + bonus ? favoured : other;
      }
    }

    emit(ctx, { type: 'CONTEST', nodeId: node, claimants, winner, method });

    // Everyone on the node who is not the winner burns. Mutual traps seal the
    // ground: there is no winner and escape passives do not function.
    for (const pid of state.playerOrder) {
      if (winner !== null && pid === winner) continue;
      const p = state.players[pid as string]!;
      for (const agent of p.agents) {
        if (!agent.alive || ctx.burned.has(agent.id as string)) continue;
        if (posOf(ctx, agent) !== nodeKey) continue;
        burnAgent(ctx, agent, 'CONTEST', winner);
      }
    }

    if (mutualTrap || winner !== null) {
      state.traps = state.traps.filter((t) => t.nodeId !== node);
    }
  }
}

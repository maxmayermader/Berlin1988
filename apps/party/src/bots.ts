import { nextInt } from '@berlin/engine';
import { PERSONALITY_IDS } from '@berlin/ai';
import type { Difficulty, RngState } from '@berlin/shared';
import type { RoomSeat, RoomState } from './state.js';

/**
 * D-07: one fixed mid-tier difficulty for every bot this phase — not the
 * lowest tier (too easy to feel like a freebie), not a difficulty picker
 * (no difficulty UI, out of scope). Chosen to sidestep the documented
 * Katja-in-duels 84% win-rate imbalance (docs/AI_OPPONENTS.md §7,
 * CONCERNS.md) without touching which personality gets drawn — see the
 * note below.
 */
export const BOT_DIFFICULTY: Difficulty = 'HANDLER';

/** The Ghost personality's measured duel dominance (CONCERNS.md) is a
 *  known playtest caveat for this phase and is explicitly out of scope to
 *  fix here — do not compensate by biasing the personality draw away from
 *  it. Every personality is equally likely. */
function titleCase(id: string): string {
  return id.charAt(0) + id.slice(1).toLowerCase();
}

/**
 * Fills every OPEN seat with a bot, walking `state.seats` in ascending
 * index order. A seat already carrying a `playerId` — HUMAN or already
 * BOT — is skipped untouched. That's what makes the join-versus-
 * countdown-expiry race safe: a human who lands a seat between the
 * countdown starting and the alarm firing keeps it, because this function
 * never takes an occupied seat back.
 *
 * Called only from the LOADOUT -> IN_GAME transition (apps/party/src/settings.ts
 * startMatch), never eagerly — 01-RESEARCH.md Pitfall 5.
 */
export function fillEmptySeatsWithBots(state: RoomState, rng: RngState): RoomState {
  const seats: RoomSeat[] = state.seats.map((seat) => {
    if (seat.playerId !== null) return seat;
    const personality = PERSONALITY_IDS[nextInt(rng, PERSONALITY_IDS.length)]!;
    return {
      ...seat,
      playerId: `bot-${seat.index}-${personality.toLowerCase()}`,
      codename: titleCase(personality),
      kind: 'BOT' as const,
      personality,
      difficulty: BOT_DIFFICULTY,
      ready: true,
    };
  });
  return { ...state, seats };
}

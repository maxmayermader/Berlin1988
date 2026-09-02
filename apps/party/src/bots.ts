import { nextInt, projectView, submitOrder } from '@berlin/engine';
import { createAgent, PERSONALITY_IDS } from '@berlin/ai';
import type { AIAgent } from '@berlin/ai';
import { playerId as toPlayerId } from '@berlin/shared';
import type { Difficulty, RngState } from '@berlin/shared';
import { botDelayMs } from './timers.js';
import type { BotSubmission, RoomSeat, RoomState } from './state.js';

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
      controlledBy: 'AI' as const,
      ready: true,
    };
  });
  return { ...state, seats };
}

/**
 * One AgentOrder per live agent of every BOT seat, decided from
 * projectView(gameState, seatId) alone — the bot is handed the projection
 * and nothing else, the same information a human in that seat would see
 * (apps/party/src/CLAUDE.md rule 5; T-1-19). Deciding is immediate;
 * releasing is scheduled (releaseAt = now + botDelayMs) — RESEARCH.md
 * Pitfall 6 is that packages/ai answers at p99 under 50ms, so an unpadded
 * bot would announce itself the instant the round opens.
 *
 * `agentCache` is owned by the caller (room.ts) and keyed by playerId, so
 * belief state persists across rounds within a match; a cache miss builds
 * a fresh AIAgent from `${matchId}:${playerId}` — deterministic, so two
 * rooms built from the same room id produce identical bot orders, and a
 * hibernation-triggered rehydration (a fresh, empty cache) re-derives the
 * same seeded agent rather than losing the seat.
 */
export function decideForBotSeats(
  state: RoomState,
  now: number,
  rng: RngState,
  agentCache: Map<string, AIAgent>,
): BotSubmission[] {
  const gameState = state.gameState;
  if (!gameState) return [];

  const submissions: BotSubmission[] = [];
  for (const seat of state.seats) {
    // Reads controlledBy, not kind — this is what makes a mid-match
    // AI-takeover seat (Task 3, D-08) decide orders exactly like an
    // original lobby-fill bot seat, without ever becoming one.
    if (seat.controlledBy !== 'AI' || !seat.playerId || !seat.personality) continue;

    const view = projectView(gameState, toPlayerId(seat.playerId));
    if (view.self.eliminated) continue;

    let agent = agentCache.get(seat.playerId);
    if (!agent) {
      agent = createAgent(seat.personality, BOT_DIFFICULTY, `${state.matchId}:${seat.playerId}`);
      agentCache.set(seat.playerId, agent);
    }

    for (const a of view.self.agents) {
      if (!a.alive) continue;
      const order = agent.decideOrder(view, a.id);
      submissions.push({ playerId: seat.playerId, order, releaseAt: now + botDelayMs(rng) });
    }
  }
  return submissions;
}

/**
 * Releases every queued bot submission whose releaseAt has passed, through
 * submitOrder() — the identical engine validation path handleSubmitOrder
 * uses for humans (apps/party/src/CLAUDE.md rule 3). A rejected submission
 * is dropped, never force-applied: routing through submitOrder rather than
 * writing pendingOrders directly is what makes that rejection possible in
 * the first place. Returns the updated RoomState and the playerIds whose
 * orders were actually accepted this call, for the caller to fan out
 * sendCommitted.
 */
export function releaseBotSubmissions(
  state: RoomState,
  now: number,
): { state: RoomState; released: string[] } {
  if (!state.gameState) return { state, released: [] };

  let gameState = state.gameState;
  const released: string[] = [];
  const remaining: BotSubmission[] = [];
  let attempted = false;

  for (const submission of state.botSubmissions) {
    if (submission.releaseAt > now) {
      remaining.push(submission);
      continue;
    }
    attempted = true;
    const result = submitOrder(gameState, toPlayerId(submission.playerId), submission.order);
    if (!result.rejection) {
      gameState = result.state;
      released.push(submission.playerId);
    }
    // A rejected submission is dropped, not retried — legalOrders() already
    // constrained the bot's decision, so a rejection here means the round's
    // state moved on before release; queuing it again would only repeat
    // the same rejection every subsequent alarm.
  }

  if (!attempted) return { state, released: [] };

  return {
    state: { ...state, gameState, botSubmissions: remaining },
    released,
  };
}

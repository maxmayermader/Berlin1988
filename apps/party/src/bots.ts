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
 * Hands a seat to a named AI once its disconnect grace period has expired
 * (D-08). Returns `state` unchanged — by reference — when the seat is
 * missing, has no `playerId`, is `kind` OPEN, or is already `controlledBy`
 * `'AI'` (a duplicate expiry can never double-take a seat). Otherwise
 * returns a new state in which that one seat has `controlledBy` set to
 * `'AI'`, a `personality` drawn via the seeded `rng` from `PERSONALITY_IDS`
 * — but ONLY when the seat doesn't already carry one, so re-taking a
 * previously-reclaimed seat keeps the same bot identity rather than
 * swapping the player's stand-in — and `difficulty` set to `BOT_DIFFICULTY`
 * when it wasn't already set. That seat's disconnect-grace entry, if any,
 * is cleared in the same transition — a taken-over seat is no longer
 * merely disconnected.
 *
 * This is the crucial divergence from `fillEmptySeatsWithBots` above: that
 * function mints a fresh synthetic `playerId` and `codename` because it is
 * claiming a never-occupied chair. Destroying those here would make a
 * later token-matched reclaim impossible — `playerId`, `token`, `codename`
 * and `kind` are preserved byte-for-byte, along with `ready`, `faction` and
 * `loadout`.
 */
export function takeOverSeat(state: RoomState, seatIndex: number, rng: RngState): RoomState {
  const seat = state.seats.find((s) => s.index === seatIndex);
  if (!seat || !seat.playerId || seat.kind === 'OPEN' || seat.controlledBy === 'AI') return state;

  const personality = seat.personality ?? PERSONALITY_IDS[nextInt(rng, PERSONALITY_IDS.length)]!;
  const difficulty = seat.difficulty ?? BOT_DIFFICULTY;

  return {
    ...state,
    seats: state.seats.map((s) =>
      s.index === seatIndex ? { ...s, controlledBy: 'AI' as const, personality, difficulty } : s,
    ),
    disconnectedSeats: state.disconnectedSeats.filter((d) => d.seatIndex !== seatIndex),
  };
}

/**
 * Reverses a takeover — the D-08 reclaim. Returns `state` unchanged unless
 * the seat exists, has `controlledBy` `'AI'`, and a non-null `playerId`.
 * Otherwise returns a SINGLE new state in which, atomically: the seat's
 * `controlledBy` flips back to `'HUMAN'`; `state.botSubmissions` is
 * filtered to drop every entry belonging to this seat's `playerId`; and the
 * seat's grace entry, if any, is cleared. All three in one returned object
 * — never as separate steps a caller could interleave an await between,
 * because apps/party/src/CLAUDE.md rule 8 makes every await point an
 * interleaving point even inside a single-threaded Durable Object.
 *
 * The `botSubmissions` filter is not defensive programming — it is the
 * fix for a verified engine fact: packages/engine/src/submitOrder.ts's
 * success path spreads a new order into `pendingOrders[agentId]` with no
 * prior-entry check, and its rejection-code union has no "already
 * committed" member. Without this purge, a bot submission still queued for
 * this seat when the human reclaims it would silently overwrite the
 * returning player's own fresh order the next time releaseBotSubmissions
 * runs, if its `releaseAt` lands after the human's SUBMIT_ORDER.
 *
 * `personality`/`difficulty` are deliberately left populated after a
 * reclaim — both are inert while `controlledBy` is `'HUMAN'` (decideForBotSeats
 * and aiReadoutFor both gate on `controlledBy`), and keeping them is what
 * lets a second takeover (via takeOverSeat's `seat.personality ?? ...`
 * guard above) restore the same bot rather than swapping the player's
 * stand-in mid-match.
 */
export function reclaimSeat(state: RoomState, seatIndex: number): RoomState {
  const seat = state.seats.find((s) => s.index === seatIndex);
  if (!seat || seat.controlledBy !== 'AI' || !seat.playerId) return state;

  const playerId = seat.playerId;
  return {
    ...state,
    seats: state.seats.map((s) => (s.index === seatIndex ? { ...s, controlledBy: 'HUMAN' as const } : s)),
    botSubmissions: state.botSubmissions.filter((sub) => sub.playerId !== playerId),
    disconnectedSeats: state.disconnectedSeats.filter((d) => d.seatIndex !== seatIndex),
  };
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

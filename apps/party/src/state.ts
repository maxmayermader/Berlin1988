import { SECTORS } from '@berlin/shared';
import type {
  AgentOrder,
  CardId,
  ChatMessage,
  Difficulty,
  GameState,
  LobbySeat,
  LobbySnapshot,
  PersonalityId,
  Sector,
} from '@berlin/shared';

/**
 * RoomState.phase is a room-local lifecycle concept
 * (LOBBY -> LOADOUT -> IN_GAME -> ENDED), kept as a 4-phase shape so Plan
 * 01-02's deckbuilder can fill LOADOUT without a state-machine change. It is
 * NOT the engine's own MatchPhase (LOBBY|LOADOUT|ORDERS|RESOLVED|FINISHED),
 * which only exists once `gameState` is non-null (from IN_GAME onward). Do
 * not conflate the two — a value like 'ORDERS' belongs to GameState.phase.
 */
export type RoomPhase = 'LOBBY' | 'LOADOUT' | 'IN_GAME' | 'ENDED';

/** The seat count a new room opens at. D-04 (Phase 3) lets the host move it
 *  anywhere between MIN_SEAT_COUNT and MAX_SEAT_COUNT before the match
 *  starts — see canSetSeatCount/setSeatCount below. No longer fixed. */
export const DEFAULT_SEAT_COUNT = 4;

/** The floor a host can never set the room below (LOBBY-01). */
export const MIN_SEAT_COUNT = 1;

/** The ceiling a host can never set the room above (LOBBY-01). */
export const MAX_SEAT_COUNT = 4;

/** 10 seconds — long enough for a player who mis-clicks Ready in a
 *  four-seat lobby to notice and un-ready before the match actually
 *  starts. Chosen by the planner; no source artifact specifies a value. */
export const COUNTDOWN_DURATION_MS = 10_000;

/**
 * A lobby seat extended with server-only fields. `token` and `connectionId`
 * never cross the wire — toSnapshot() strips both before a ROOM_STATE frame
 * is built.
 */
export interface RoomSeat extends LobbySeat {
  /** Room-minted opaque token binding a future connection to this seat. */
  token: string | null;
  /** The live connection currently bound to this seat, if any. */
  connectionId: string | null;
  /** Server-only, never in toSnapshot() — LOBBY-07's AI name/personality
   *  readout is Phase 3 scope. Populated only for BOT seats, by
   *  fillEmptySeatsWithBots at match start. */
  personality: PersonalityId | null;
  difficulty: Difficulty | null;
  /** Server-only, never in toSnapshot()/LobbySeat/lobbySeatSchema — a
   *  loadout is hidden pre-match information (02-RESEARCH.md Pitfall 5,
   *  docs/GAME_DESIGN.md §6.3: card *usage* is public, card *possession*
   *  is not). Set by SUBMIT_LOADOUT via setLoadout(); read by
   *  settings.ts's startMatch() for a human seat's dealt loadout. Null
   *  until a legal SUBMIT_LOADOUT has been accepted for this seat. */
  loadout: CardId[] | null;
}

export interface RoomState {
  code: string;
  matchId: string;
  phase: RoomPhase;
  hostPlayerId: string;
  seats: RoomSeat[];
  /** Absolute ms timestamp the match auto-starts at, or null when no
   *  countdown is running. Server-authoritative — see recomputeCountdown. */
  startsAt: number | null;
  /** Filled from the LOADOUT -> IN_GAME transition. Stays null all of Phase 1 Plan 01-01. */
  gameState: GameState | null;
  /** Absolute ms timestamp the current round's order phase closes at, or
   *  null when no round clock is running (LOBBY/LOADOUT, or ENDED).
   *  Server-authoritative — see apps/party/src/timers.ts scheduleRoundDeadline.
   *  Never derived client-side; every client renders from this same number. */
  deadlineAt: number | null;
  /** The gameState.round this deadlineAt belongs to. The write-once guard:
   *  a second scheduleRoundDeadline call for the same round number is a
   *  no-op, which is what stops the visible countdown from resetting or
   *  jumping backwards mid-round. */
  deadlineRound: number | null;
  /** Bot orders already decided for the current round but not yet released
   *  into pendingOrders — apps/party/src/bots.ts decideForBotSeats fills
   *  this, releaseBotSubmissions drains it. Empty outside IN_GAME. */
  botSubmissions: BotSubmission[];
  /** Two separate, phase-scoped, bounded logs (D-10) — apps/party/src/chat.ts
   *  owns chatScopeFor/appendChat, the sole authority for which scope a
   *  message lands in and how the log is trimmed. Never derived into
   *  toSnapshot(); chat travels on its own CHAT_MESSAGE/CHAT_HISTORY frames. */
  chat: { readonly LOBBY: ChatMessage[]; readonly MATCH: ChatMessage[] };
}

/** One bot seat's already-decided order for the current round, queued for
 *  release once its padded think-time elapses (T-1-14 — a bot seat is not
 *  identifiable by response time). */
export interface BotSubmission {
  readonly playerId: string;
  readonly order: AgentOrder;
  /** Absolute ms timestamp — mirrors deadlineAt's convention, never a
   *  remaining duration. */
  readonly releaseAt: number;
}

/** One open seat at `index` for `faction` — the shape every seat starts in
 *  and the shape vacateSeat (Task 2) resets a kicked seat back to. Kept as
 *  its own function so emptySeats() and setSeatCount()'s seat-growth branch
 *  never duplicate this literal. */
function openSeat(index: number, faction: Sector): RoomSeat {
  return {
    index,
    playerId: null,
    codename: null,
    faction,
    kind: 'OPEN' as const,
    ready: false,
    token: null,
    connectionId: null,
    personality: null,
    difficulty: null,
    loadout: null,
  };
}

/** `count` open seats (default DEFAULT_SEAT_COUNT), one per SECTORS entry,
 *  in index order. */
export function emptySeats(count: number = DEFAULT_SEAT_COUNT): RoomSeat[] {
  return SECTORS.slice(0, count).map((faction, index) => openSeat(index, faction));
}

/**
 * Seat order is assigned once, at join time (index 0 = host, ascending for
 * later joiners), and is NEVER re-sorted or re-derived from ready state.
 * Every transition below maps over `seats` in array order and changes only
 * the one matching seat's fields — reordering here would move a player's
 * row on every client mid-lobby.
 */

/**
 * Writes only the matching seat's `ready` field, so two players toggling in
 * the same tick each land independently rather than one clobbering the
 * other's read of the whole array. No-op once the room has left LOBBY.
 */
export function setReady(state: RoomState, playerId: string, ready: boolean): RoomState {
  if (state.phase !== 'LOBBY') return state;
  return {
    ...state,
    seats: state.seats.map((seat) => (seat.playerId === playerId ? { ...seat, ready } : seat)),
  };
}

/** Rejected once the seat is ready — D-09's rename-before-ready rule. */
export function setCodename(state: RoomState, playerId: string, codename: string): RoomState {
  if (state.phase !== 'LOBBY') return state;
  return {
    ...state,
    seats: state.seats.map((seat) =>
      seat.playerId === playerId && !seat.ready ? { ...seat, codename } : seat,
    ),
  };
}

/**
 * Writes only the matching seat's `loadout` field, immutably — same shape as
 * setCodename. Two deliberate differences from setCodename's rename rule:
 * (1) the guard admits both LOBBY and LOADOUT phases, mirroring startMatch's
 * own guard, rather than LOBBY alone; (2) this does NOT refuse a seat whose
 * `ready` flag is set — D-05 clears ready as a separate explicit client step,
 * so gating this write on `!seat.ready` would silently drop a legitimate
 * submission that arrived a moment after the client's own SET_READY.
 */
export function setLoadout(state: RoomState, playerId: string, cards: CardId[]): RoomState {
  if (state.phase !== 'LOBBY' && state.phase !== 'LOADOUT') return state;
  return {
    ...state,
    seats: state.seats.map((seat) =>
      seat.playerId === playerId ? { ...seat, loadout: cards } : seat,
    ),
  };
}

/**
 * The lowest seat count that would strand no occupied seat — the highest
 * *index* among seats whose `kind` is not `OPEN`, plus one, or
 * MIN_SEAT_COUNT when no seat is occupied. Deliberately the highest
 * occupied *index*, not the *count* of occupied seats: a prior kick
 * (Task 2's vacateSeat) can leave an occupied seat above an open one — e.g.
 * seats 0 and 2 occupied, seat 1 open — and a count-based threshold (2, in
 * that example) would then let the host shrink the room to 2 seats and
 * silently truncate the player sitting in seat 2. That is exactly the
 * ejection-by-seat-count-change D-05 forbids, so the threshold must track
 * the highest surviving index, not how many seats happen to be filled.
 */
export function minSeatCount(state: RoomState): number {
  let highestOccupied = -1;
  for (const seat of state.seats) {
    if (seat.kind !== 'OPEN' && seat.index > highestOccupied) highestOccupied = seat.index;
  }
  return highestOccupied === -1 ? MIN_SEAT_COUNT : highestOccupied + 1;
}

/**
 * The single server-side authority for whether a seat-count change is
 * legal (D-04, D-05) — handleSetSeatCount calls this and nothing
 * re-derives the rule. The wire schema's own 1..4 bound (packages/shared/src/protocol.ts)
 * is defence in depth, not a substitute for this check.
 */
export function canSetSeatCount(state: RoomState, count: number): boolean {
  return (
    Number.isInteger(count) &&
    count >= MIN_SEAT_COUNT &&
    count <= MAX_SEAT_COUNT &&
    count >= minSeatCount(state) &&
    (state.phase === 'LOBBY' || state.phase === 'LOADOUT')
  );
}

/**
 * Resizes the room to `count` seats. Returns `state` unchanged — by
 * reference — when the change is illegal (canSetSeatCount is false) or
 * already applied (state.seats.length === count): the latter is what makes
 * a repeated identical value a genuine reference-equal no-op, which
 * room.ts's existing reference-distinct broadcast guard then turns into "no
 * duplicate ROOM_STATE frame". Shrinking slices the existing seats down;
 * growing appends freshly-built OPEN seats for the new indices, each
 * faction drawn from SECTORS at that index (openSeat/emptySeats' own
 * convention). Always re-derives the countdown threshold afterward — a
 * shrinking room changes the filled-seat denominator readyRatio divides by,
 * exactly like every other lobby mutation that already re-derives it.
 */
export function setSeatCount(state: RoomState, count: number, now: number): RoomState {
  if (!canSetSeatCount(state, count) || state.seats.length === count) return state;

  const seats =
    count < state.seats.length
      ? state.seats.slice(0, count)
      : [
          ...state.seats,
          ...SECTORS.slice(state.seats.length, count).map((faction, i) =>
            openSeat(state.seats.length + i, faction),
          ),
        ];

  return recomputeCountdown({ ...state, seats }, now, COUNTDOWN_DURATION_MS);
}

/**
 * Resets the seat at `seatIndex` back to the OPEN shape openSeat()/emptySeats()
 * build — playerId, codename, token, connectionId, personality, difficulty
 * and loadout all null, ready false — while `index` and `faction` are
 * preserved unchanged. Seat order is assigned once at join time and is
 * never re-sorted (see the file header comment above), so vacating leaves a
 * hole in the array rather than compacting it; minSeatCount() above is what
 * makes that hole safe — it refuses to shrink the room below the highest
 * remaining occupied index, so a hole below an occupied seat never becomes
 * an ejection.
 */
export function vacateSeat(state: RoomState, seatIndex: number): RoomState {
  return {
    ...state,
    seats: state.seats.map((seat) =>
      seat.index === seatIndex ? openSeat(seat.index, seat.faction) : seat,
    ),
  };
}

/** Ready filled seats over total filled seats. Total function — an
 *  entirely-open room returns 0 rather than dividing by zero. Open seats
 *  count in neither the numerator nor the denominator. */
export function readyRatio(state: RoomState): number {
  const filled = state.seats.filter((seat) => seat.kind !== 'OPEN');
  if (filled.length === 0) return 0;
  const ready = filled.filter((seat) => seat.ready).length;
  return ready / filled.length;
}

/** The threshold is inclusive: exactly 50% starts the countdown. */
export function countdownShouldRun(state: RoomState): boolean {
  const filledCount = state.seats.filter((seat) => seat.kind !== 'OPEN').length;
  return filledCount > 0 && readyRatio(state) >= 0.5;
}

/**
 * Recomputed after every state-changing event — join, ready-toggle,
 * codename — not only ready toggles (01-RESEARCH.md Pitfall 5: lobby
 * readiness is a read-then-write race class unless the threshold is
 * re-derived on every mutation, not cached from the triggering event
 * alone). A false-to-true transition starts a fresh `durationMs`-long
 * countdown from `now`; a true-to-false transition (a player un-readying,
 * or a new join dropping the ratio back below 50%) clears it. A no-op
 * outside LOBBY.
 */
export function recomputeCountdown(state: RoomState, now: number, durationMs: number): RoomState {
  if (state.phase !== 'LOBBY') return state;
  const shouldRun = countdownShouldRun(state);
  if (shouldRun && state.startsAt === null) {
    return { ...state, startsAt: now + durationMs };
  }
  if (!shouldRun && state.startsAt !== null) {
    return { ...state, startsAt: null };
  }
  return state;
}

/** Strips server-only fields (token, connectionId) for the wire. */
export function toSnapshot(state: RoomState): LobbySnapshot {
  return {
    code: state.code,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
    startsAt: state.startsAt,
    seats: state.seats.map((seat) => ({
      index: seat.index,
      playerId: seat.playerId,
      codename: seat.codename,
      faction: seat.faction,
      kind: seat.kind,
      ready: seat.ready,
    })),
  };
}

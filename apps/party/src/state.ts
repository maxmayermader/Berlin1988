import { SECTORS } from '@berlin/shared';
import type { Difficulty, GameState, LobbySeat, LobbySnapshot, PersonalityId } from '@berlin/shared';

/**
 * RoomState.phase is a room-local lifecycle concept
 * (LOBBY -> LOADOUT -> IN_GAME -> ENDED), kept as a 4-phase shape so Plan
 * 01-02's deckbuilder can fill LOADOUT without a state-machine change. It is
 * NOT the engine's own MatchPhase (LOBBY|LOADOUT|ORDERS|RESOLVED|FINISHED),
 * which only exists once `gameState` is non-null (from IN_GAME onward). Do
 * not conflate the two — a value like 'ORDERS' belongs to GameState.phase.
 */
export type RoomPhase = 'LOBBY' | 'LOADOUT' | 'IN_GAME' | 'ENDED';

/** Seat count is fixed at 4 for Phase 1 — host seat-count control is Phase 3. */
export const SEAT_COUNT = 4;

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
}

/** Four open seats, one per SECTORS entry, in index order. */
export function emptySeats(): RoomSeat[] {
  return SECTORS.slice(0, SEAT_COUNT).map((faction, index) => ({
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
  }));
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

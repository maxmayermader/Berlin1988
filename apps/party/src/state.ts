import { SECTORS } from '@berlin/shared';
import type { GameState, LobbySeat, LobbySnapshot } from '@berlin/shared';

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
}

export interface RoomState {
  code: string;
  matchId: string;
  phase: RoomPhase;
  hostPlayerId: string;
  seats: RoomSeat[];
  /** Filled from the LOADOUT -> IN_GAME transition. Stays null all of Phase 1 Plan 01-01. */
  gameState: GameState | null;
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

/** Strips server-only fields (token, connectionId) for the wire. */
export function toSnapshot(state: RoomState): LobbySnapshot {
  return {
    code: state.code,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
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

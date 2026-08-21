import { nextInt } from '@berlin/engine';
import type { RngState } from '@berlin/shared';
import type { RoomSeat, RoomState } from './state.js';

const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TOKEN_LENGTH = 24;

/**
 * Room-minted opaque connection token. Never derived from anything the
 * client supplies — the room is the only party that can mint one.
 */
export function mintToken(rng: RngState): string {
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[nextInt(rng, TOKEN_ALPHABET.length)];
  }
  return out;
}

/** Binds a connection id to a seat. Returns new state; does not mutate. */
export function bindConnection(state: RoomState, connectionId: string, seatIndex: number): RoomState {
  return {
    ...state,
    seats: state.seats.map((seat) =>
      seat.index === seatIndex ? { ...seat, connectionId } : seat,
    ),
  };
}

/**
 * Resolves the acting player's seat from the connection id alone. A
 * `playerId` arriving in a message body is never read — apps/party/src/CLAUDE.md
 * rule 2.
 */
export function seatFor(state: RoomState, connectionId: string): RoomSeat | null {
  return state.seats.find((seat) => seat.connectionId === connectionId) ?? null;
}

/** Finds a seat by its room-minted token — used to rebind a fresh connection
 *  (e.g. the lobby route's own socket) to a seat established by an earlier,
 *  now-closed connection (e.g. the home page's create/join handshake). */
export function seatForToken(state: RoomState, token: string): RoomSeat | null {
  return state.seats.find((seat) => seat.token === token) ?? null;
}

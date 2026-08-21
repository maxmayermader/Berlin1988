import type { ClientMessage, RngState, ServerMessage } from '@berlin/shared';
import { bindConnection, mintToken, seatFor } from './auth.js';
import { newJoinCode } from './joinCode.js';
import { emptySeats, setCodename, setReady, type RoomState } from './state.js';

const JOIN_CODE_SHAPE = /^[A-Z0-9]{6}$/;

function isJoinCodeShaped(roomId: string): boolean {
  return JOIN_CODE_SHAPE.test(roomId);
}

export interface HandlerResult {
  state: RoomState | null;
  /** Reply sent only to the connection that sent the inbound message. */
  toSender: ServerMessage;
  /** Whether every connection in the room should also receive a fresh ROOM_STATE. */
  broadcastRoomState: boolean;
}

/**
 * CREATE — mints a join code, seats the caller as host in seat 0, and
 * initializes a fresh RoomState.
 *
 * `roomId` is the party room this message arrived on. In production the
 * client is routed here only after minting a code via the room.ts `_new`
 * HTTP endpoint and connecting directly to `room: <that code>` — so `roomId`
 * is already code-shaped and becomes the match code with no cross-room
 * migration required. The in-process test harness connects directly to one
 * room whose id is not code-shaped, so this mints a fresh code instead —
 * exactly mirroring what the `_new` endpoint would have produced.
 */
export function handleCreate(
  roomId: string,
  codename: string,
  connectionId: string,
  rng: RngState,
): HandlerResult {
  const code = isJoinCodeShaped(roomId) ? roomId : newJoinCode(rng);
  const hostPlayerId = mintToken(rng);
  const token = mintToken(rng);
  const seats = emptySeats();
  const hostSeat = seats[0];
  if (!hostSeat) {
    throw new Error('emptySeats() returned no seats — SEAT_COUNT must be >= 1');
  }
  seats[0] = {
    ...hostSeat,
    playerId: hostPlayerId,
    codename,
    kind: 'HUMAN',
    token,
    connectionId,
  };

  const state: RoomState = {
    code,
    matchId: code,
    phase: 'LOBBY',
    hostPlayerId,
    seats,
    gameState: null,
  };

  return {
    state,
    toSender: { type: 'JOINED', playerId: hostPlayerId, token, code },
    broadcastRoomState: true,
  };
}

/**
 * JOIN — two paths. A `token` matching an existing seat rebinds this
 * connection to that seat without consuming an open one (the lobby route's
 * own socket, reconnecting after the create/join handshake connection that
 * minted the token has already closed). No token, or a token that matches
 * nothing, binds the next open seat as a brand-new player.
 */
export function handleJoin(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'JOIN' }>,
  connectionId: string,
  rng: RngState,
): HandlerResult {
  if (!state || state.code !== message.code) {
    return {
      state,
      toSender: {
        type: 'ERROR',
        code: 'UNKNOWN_CODE',
        message: "That code doesn't match an open lobby.",
      },
      broadcastRoomState: false,
    };
  }

  if (message.token) {
    const existing = state.seats.find((seat) => seat.token === message.token);
    if (existing) {
      const rebound = bindConnection(state, connectionId, existing.index);
      return {
        state: rebound,
        toSender: {
          type: 'JOINED',
          playerId: existing.playerId ?? '',
          token: message.token,
          code: state.code,
        },
        broadcastRoomState: true,
      };
    }
  }

  const openSeat = state.seats.find((seat) => seat.kind === 'OPEN');
  if (!openSeat) {
    return {
      state,
      toSender: {
        type: 'ERROR',
        code: 'ROOM_FULL',
        message: 'This lobby already has four players.',
      },
      broadcastRoomState: false,
    };
  }

  const playerId = mintToken(rng);
  const token = mintToken(rng);
  const seats = state.seats.map((seat) =>
    seat.index === openSeat.index
      ? { ...seat, playerId, codename: message.codename, kind: 'HUMAN' as const, token, connectionId }
      : seat,
  );
  const nextState: RoomState = { ...state, seats };

  return {
    state: nextState,
    toSender: { type: 'JOINED', playerId, token, code: state.code },
    broadcastRoomState: true,
  };
}

/**
 * SET_READY / SET_CODENAME — both resolve the acting seat through
 * `seatFor(state, connectionId)` and return early (state unchanged) if
 * there is no binding for this connection. Neither reads a playerId from
 * the message body (apps/party/src/CLAUDE.md rule 2). Room.ts hands the
 * returned state to `sendLobby` — handlers never send directly.
 */
export function handleSetReady(
  state: RoomState | null,
  ready: boolean,
  connectionId: string,
): RoomState | null {
  if (!state) return null;
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return state;
  return setReady(state, seat.playerId, ready);
}

export function handleSetCodename(
  state: RoomState | null,
  codename: string,
  connectionId: string,
): RoomState | null {
  if (!state) return null;
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return state;
  return setCodename(state, seat.playerId, codename);
}

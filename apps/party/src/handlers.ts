import { DEFAULT_RULESET, submitOrder, validateLoadout } from '@berlin/engine';
import {
  agentId as toAgentId,
  playerId as toPlayerId,
  type AgentOrder,
  type ClientMessage,
  type RngState,
  type ServerMessage,
} from '@berlin/shared';
import { bindConnection, mintToken, seatFor } from './auth.js';
import { newJoinCode } from './joinCode.js';
import {
  COUNTDOWN_DURATION_MS,
  emptySeats,
  recomputeCountdown,
  setCodename,
  setLoadout,
  setReady,
  type RoomState,
} from './state.js';

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
    startsAt: null,
    gameState: null,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
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
  now: number,
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
      const rebound = recomputeCountdown(
        bindConnection(state, connectionId, existing.index),
        now,
        COUNTDOWN_DURATION_MS,
      );
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
  // A new join recomputes the threshold — an extra filled seat can drop an
  // already-counting-down ratio back below 50% (01-RESEARCH.md Pitfall 5).
  const nextState: RoomState = recomputeCountdown({ ...state, seats }, now, COUNTDOWN_DURATION_MS);

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
 * the message body (apps/party/src/CLAUDE.md rule 2). Both recompute the
 * countdown threshold on the tail end — not only ready toggles fire this;
 * a rename doesn't change the ratio, but it's cheap and correct to
 * recompute uniformly rather than special-case which events might matter.
 * Room.ts hands the returned state to `sendLobby` — handlers never send
 * directly.
 */
export function handleSetReady(
  state: RoomState | null,
  ready: boolean,
  connectionId: string,
  now: number,
): RoomState | null {
  if (!state) return null;
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return state;
  const withReady = setReady(state, seat.playerId, ready);
  return recomputeCountdown(withReady, now, COUNTDOWN_DURATION_MS);
}

export function handleSetCodename(
  state: RoomState | null,
  codename: string,
  connectionId: string,
  now: number,
): RoomState | null {
  if (!state) return null;
  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return state;
  const withCodename = setCodename(state, seat.playerId, codename);
  return recomputeCountdown(withCodename, now, COUNTDOWN_DURATION_MS);
}

export interface SubmitOrderResult {
  state: RoomState | null;
  /** Null when there is no seat binding for this connection — mirrors
   *  handleSetReady/handleSetCodename's silent no-op for an unbound
   *  connection: nothing is sent back and state is untouched. */
  toSender: ServerMessage | null;
  /** The accepting player's id, present only when submitOrder() returned no
   *  rejection — what room.ts uses to fan out OPPONENT_COMMITTED and check
   *  shouldCloseRound. Null on every rejection path. */
  acceptedFor: string | null;
}

/**
 * SUBMIT_ORDER — re-validates every order against the room's own GameState
 * via the engine's own submitOrder(), regardless of what the client
 * previewed. Ownership is enforced twice on purpose: the acting PlayerId
 * comes from seatFor(connectionId) (never from the message body, per
 * apps/party/src/CLAUDE.md rule 2), and the engine independently answers
 * NOT_YOUR_AGENT for an agent that isn't on that seat.
 *
 * Never answers before submitOrder() returns — an optimistic ack sent ahead
 * of validation is exactly the "player believes an order landed when it
 * didn't" bug 01-RESEARCH.md Pitfall 2/2b describes.
 */
export function handleSubmitOrder(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'SUBMIT_ORDER' }>,
  connectionId: string,
): SubmitOrderResult {
  if (!state) return { state: null, toSender: null, acceptedFor: null };

  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return { state, toSender: null, acceptedFor: null };

  if (state.phase !== 'IN_GAME' || !state.gameState || state.gameState.phase !== 'ORDERS') {
    return {
      state,
      toSender: { type: 'ERROR', code: 'WRONG_PHASE', message: 'No order phase is open right now.' },
      acceptedFor: null,
    };
  }

  // A stale frame from a client that hasn't yet processed a resolution must
  // not land in the new round.
  if (message.round !== state.gameState.round) {
    return {
      state,
      toSender: {
        type: 'ERROR',
        code: 'WRONG_PHASE',
        message: `Round ${message.round} is stale; the current round is ${state.gameState.round}.`,
      },
      acceptedFor: null,
    };
  }

  const order: AgentOrder = {
    agentId: toAgentId(message.agentId),
    actions: message.actions,
    ...(message.buySilencers !== undefined ? { buySilencers: message.buySilencers } : {}),
  };

  const result = submitOrder(state.gameState, toPlayerId(seat.playerId), order);

  if (result.rejection) {
    return {
      state,
      toSender: {
        type: 'ORDER_REJECTED',
        round: state.gameState.round,
        agentId: message.agentId,
        code: result.rejection.code,
        message: result.rejection.message,
      },
      acceptedFor: null,
    };
  }

  return {
    state: { ...state, gameState: result.state },
    toSender: { type: 'ORDER_ACK', round: state.gameState.round, agentId: message.agentId },
    acceptedFor: seat.playerId,
  };
}

export interface SubmitLoadoutResult {
  state: RoomState | null;
  /** Null when there is no seat binding for this connection — mirrors
   *  handleSetReady/handleSetCodename's silent no-op for an unbound
   *  connection: nothing is sent back and state is untouched. */
  toSender: ServerMessage | null;
}

/**
 * SUBMIT_LOADOUT — re-validates the submitted cards against the engine's own
 * validateLoadout() before storing anything, regardless of what the client's
 * own D-03 disable-until-legal gate already checked (that gate is UX only,
 * never the enforcement — 02-RESEARCH.md Pitfall 2). The acting seat comes
 * from seatFor(connectionId), never from the message body — the
 * SUBMIT_LOADOUT schema has no identity field to read (T-2-01).
 *
 * No ROOM_STATE broadcast follows a loadout write: the public lobby snapshot
 * carries nothing derived from a seat's loadout (T-2-03), so there is
 * nothing for other connections to learn from this message landing.
 */
export function handleSubmitLoadout(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'SUBMIT_LOADOUT' }>,
  connectionId: string,
): SubmitLoadoutResult {
  if (!state) return { state: null, toSender: null };

  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return { state, toSender: null };

  if (state.phase !== 'LOBBY' && state.phase !== 'LOADOUT') {
    return {
      state,
      toSender: { type: 'ERROR', code: 'WRONG_PHASE', message: 'The match has already started.' },
    };
  }

  const violations = validateLoadout(message.cards, DEFAULT_RULESET);
  if (violations.length > 0) {
    return {
      state,
      toSender: {
        type: 'LOADOUT_REJECTED',
        message: violations.map((v) => v.message).join(' '),
      },
    };
  }

  const nextState = setLoadout(state, seat.playerId, [...message.cards]);
  return {
    state: nextState,
    toSender: { type: 'LOADOUT_ACK', cards: message.cards.map((id) => id as string) },
  };
}

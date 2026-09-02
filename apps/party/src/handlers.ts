import { DEFAULT_RULESET, submitOrder, validateLoadout } from '@berlin/engine';
import {
  agentId as toAgentId,
  playerId as toPlayerId,
  promptText,
  type AgentOrder,
  type ChatMessage,
  type ChatScope,
  type ClientMessage,
  type RngState,
  type ServerMessage,
} from '@berlin/shared';
import { bindConnection, mintToken, seatFor } from './auth.js';
import { reclaimSeat } from './bots.js';
import { appendChat, chatLogFor, chatScopeFor } from './chat.js';
import { newJoinCode } from './joinCode.js';
import {
  canSetSeatCount,
  COUNTDOWN_DURATION_MS,
  emptySeats,
  minSeatCount,
  recomputeCountdown,
  setCodename,
  setLoadout,
  setReady,
  setSeatCount,
  vacateSeat,
  type RoomState,
} from './state.js';
import { clearDisconnectGrace } from './timers.js';

const JOIN_CODE_SHAPE = /^[A-Z0-9]{6}$/;

function isJoinCodeShaped(roomId: string): boolean {
  return JOIN_CODE_SHAPE.test(roomId);
}

/** The chat scope + stored messages a joining/reconnecting connection should
 *  be caught up with, or null when the join itself failed (no room to catch
 *  up on). Populated by handleJoin's two successful paths from
 *  chatLogFor(state, chatScopeFor(state.phase)). */
export interface ChatHistoryPayload {
  scope: ChatScope;
  messages: readonly ChatMessage[];
}

export interface HandlerResult {
  state: RoomState | null;
  /** Reply sent only to the connection that sent the inbound message. */
  toSender: ServerMessage;
  /** Whether every connection in the room should also receive a fresh ROOM_STATE. */
  broadcastRoomState: boolean;
  /** The chat history the connection should be caught up with — non-null
   *  only on handleJoin's two successful paths (03-03-PLAN.md Task 2). Null
   *  for handleCreate (a brand-new room has no prior chat) and for every
   *  error path. */
  chatHistory: ChatHistoryPayload | null;
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
    throw new Error('emptySeats() returned no seats — DEFAULT_SEAT_COUNT must be >= 1');
  }
  seats[0] = {
    ...hostSeat,
    playerId: hostPlayerId,
    codename,
    kind: 'HUMAN',
    token,
    connectionId,
    controlledBy: 'HUMAN',
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
    chat: { LOBBY: [], MATCH: [] },
    disconnectedSeats: [],
  };

  return {
    state,
    toSender: { type: 'JOINED', playerId: hostPlayerId, token, code },
    broadcastRoomState: true,
    // A brand-new room has no prior chat to catch the host up on.
    chatHistory: null,
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
      chatHistory: null,
    };
  }

  if (message.token) {
    const existing = state.seats.find((seat) => seat.token === message.token);
    if (existing) {
      // The D-07 silent-reclaim path: a token-matched JOIN always clears
      // any live grace entry for this seat, whether or not AI has taken
      // over yet — partysocket's own auto-reconnect already re-sends JOIN
      // with the stored token on open, so this one branch is both "you
      // came back before the grace window closed" (no AI ever involved)
      // and — D-08 — "you came back after AI took over". When AI has
      // taken the seat, reclaimSeat runs the whole control-flip +
      // botSubmissions purge as one atomic transition (the fix for the
      // verified submitOrder() overwrite race, T-03-19); clearDisconnectGrace
      // alone still covers the plain-reconnect-before-takeover case.
      const regrace = clearDisconnectGrace(state, existing.index);
      const reclaimed = existing.controlledBy === 'AI' ? reclaimSeat(regrace, existing.index) : regrace;
      const rebound = recomputeCountdown(
        bindConnection(reclaimed, connectionId, existing.index),
        now,
        COUNTDOWN_DURATION_MS,
      );
      const scope = chatScopeFor(rebound.phase);
      return {
        state: rebound,
        toSender: {
          type: 'JOINED',
          playerId: existing.playerId ?? '',
          token: message.token,
          code: state.code,
        },
        broadcastRoomState: true,
        chatHistory: { scope, messages: chatLogFor(rebound, scope) },
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
        // Interpolated from the room's own current seat count (D-04, this
        // plan) rather than a hardcoded "four" — the host may have sized
        // this lobby down to 1-3 seats.
        message: `This lobby already has ${state.seats.length} player${state.seats.length === 1 ? '' : 's'}.`,
      },
      broadcastRoomState: false,
      chatHistory: null,
    };
  }

  const playerId = mintToken(rng);
  const token = mintToken(rng);
  const seats = state.seats.map((seat) =>
    seat.index === openSeat.index
      ? {
          ...seat,
          playerId,
          codename: message.codename,
          kind: 'HUMAN' as const,
          token,
          connectionId,
          controlledBy: 'HUMAN' as const,
        }
      : seat,
  );
  // A new join recomputes the threshold — an extra filled seat can drop an
  // already-counting-down ratio back below 50% (01-RESEARCH.md Pitfall 5).
  const nextState: RoomState = recomputeCountdown({ ...state, seats }, now, COUNTDOWN_DURATION_MS);
  const scope = chatScopeFor(nextState.phase);

  return {
    state: nextState,
    toSender: { type: 'JOINED', playerId, token, code: state.code },
    broadcastRoomState: true,
    chatHistory: { scope, messages: chatLogFor(nextState, scope) },
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

export interface SetSeatCountResult {
  state: RoomState | null;
  /** Null when there is no seat binding for this connection — mirrors
   *  handleSetReady's silent no-op for an unbound connection. Otherwise
   *  always non-null: unlike SET_READY/SET_CODENAME, a non-host actor gets
   *  an explicit SET_SEAT_COUNT_REJECTED reply rather than a silent no-op,
   *  so a mis-wired client surfaces the refusal instead of hanging. */
  toSender: ServerMessage | null;
}

/**
 * SET_SEAT_COUNT — the first host-only message in the codebase
 * (apps/party/CLAUDE.md rule 5: host-only messages are verified against the
 * seat that owns the room, not a flag in the message body). Resolves the
 * acting seat via seatFor(connectionId) exactly like handleSetReady, then
 * additionally compares seat.playerId against state.hostPlayerId before any
 * mutation — the wire schema has no role field to trust instead.
 */
export function handleSetSeatCount(
  state: RoomState | null,
  count: number,
  connectionId: string,
  now: number,
): SetSeatCountResult {
  if (!state) return { state: null, toSender: null };

  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId) return { state, toSender: null };

  if (seat.playerId !== state.hostPlayerId) {
    return {
      state,
      toSender: {
        type: 'SET_SEAT_COUNT_REJECTED',
        message: 'Only the host can change the seat count.',
      },
    };
  }

  if (!canSetSeatCount(state, count)) {
    return {
      state,
      toSender: {
        type: 'SET_SEAT_COUNT_REJECTED',
        message: `Can't go below ${minSeatCount(state)} — seats are filled.`,
      },
    };
  }

  return { state: setSeatCount(state, count, now), toSender: null };
}

export interface KickResult {
  state: RoomState | null;
  /** Null only when there is no seat binding for this connection — mirrors
   *  handleSetSeatCount's silent no-op for an unbound connection. Every
   *  refusal (non-host, self-kick, OPEN target, out-of-bounds index, wrong
   *  phase) gets an explicit ERROR reply instead. */
  toSender: ServerMessage | null;
  /** The vacated seat's former connectionId, captured before vacating —
   *  null on every path that didn't actually kick anyone. room.ts uses this
   *  to sendTo() the kicked connection a KICKED message. */
  kickedConnectionId: string | null;
}

/**
 * KICK — the second host-only message this plan adds, following
 * handleSetSeatCount's exact pattern: resolve the acting seat via
 * seatFor(connectionId), compare against state.hostPlayerId, refuse with an
 * explicit reply rather than a silent no-op. `seatIndex` is a position in
 * the room's own array, never a playerId (T-03-07) — so "does this index
 * refer to a real, kickable, non-host occupant" is checked entirely against
 * the room's own current seats, never against anything the client claims.
 */
export function handleKick(
  state: RoomState | null,
  seatIndex: number,
  connectionId: string,
  now: number,
): KickResult {
  if (!state) return { state: null, toSender: null, kickedConnectionId: null };

  const actingSeat = seatFor(state, connectionId);
  if (!actingSeat || !actingSeat.playerId) {
    return { state, toSender: null, kickedConnectionId: null };
  }

  if (actingSeat.playerId !== state.hostPlayerId) {
    return {
      state,
      toSender: { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Only the host can remove a player.' },
      kickedConnectionId: null,
    };
  }

  if (state.phase !== 'LOBBY' && state.phase !== 'LOADOUT') {
    return {
      state,
      toSender: { type: 'ERROR', code: 'BAD_MESSAGE', message: 'The match has already started.' },
      kickedConnectionId: null,
    };
  }

  const target = state.seats.find((seat) => seat.index === seatIndex);
  if (!target) {
    return {
      state,
      toSender: { type: 'ERROR', code: 'BAD_MESSAGE', message: "That seat doesn't exist." },
      kickedConnectionId: null,
    };
  }

  if (target.kind === 'OPEN') {
    return {
      state,
      toSender: { type: 'ERROR', code: 'BAD_MESSAGE', message: "That seat is already empty." },
      kickedConnectionId: null,
    };
  }

  if (target.playerId === state.hostPlayerId) {
    return {
      state,
      toSender: { type: 'ERROR', code: 'BAD_MESSAGE', message: "The host can't remove themselves." },
      kickedConnectionId: null,
    };
  }

  const kickedConnectionId = target.connectionId;
  // Clear a live grace entry for this seat before vacating it — otherwise a
  // kick landing mid-reconnect-window leaves disconnectedSeats pointing at
  // a now-OPEN seat forever (takeOverSeat no-ops on OPEN, so nothing ever
  // consumes the stale entry), and alarmTarget() keeps selecting its
  // already-past graceExpiresAt as the next alarm target — an unbounded
  // busy-fire loop for the room's remaining lifetime (found in code review).
  const withoutGrace = clearDisconnectGrace(state, seatIndex);
  const next = recomputeCountdown(vacateSeat(withoutGrace, seatIndex), now, COUNTDOWN_DURATION_MS);
  return { state: next, toSender: null, kickedConnectionId };
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

export interface ChatSendResult {
  state: RoomState | null;
  /** Sent only to the sender — CHAT_REJECTED on an empty/whitespace-only
   *  message, otherwise null (a successful send gets no dedicated ack; the
   *  sender learns its message landed the same way every other connection
   *  does, from the room-wide CHAT_MESSAGE broadcast). */
  toSender: ServerMessage | null;
  /** The message every connection in the room should receive via
   *  broadcast.ts's sendChat, or null on any rejected/no-op path. */
  broadcast: ChatMessage | null;
}

/**
 * CHAT_SEND — the first handler in this codebase resolving free-form human
 * text (apps/party/CLAUDE.md rule 2 still applies: the acting seat comes
 * from seatFor(connectionId), never from the message body — the CHAT_SEND
 * schema has no identity field to read in the first place, per D-11).
 * `built.codename` is always `seat.codename` — nothing about the message's
 * attribution is ever read from `message`. The message's scope is derived
 * from chatScopeFor(state.phase), never hardcoded — this is what makes
 * D-10's lobby/match separation a property of the phase machine, and
 * appendChat is what makes the resulting state carry the message in its own
 * bounded, phase-scoped log.
 *
 * Resolves the message's text before anything else: a `promptId` is looked
 * up via promptText() and rejected with CHAT_REJECTED when it's out of
 * range (T-03-17 — the client only ever selects a reviewed line, never
 * supplies prompt text itself); a `text` is trimmed and rejected when the
 * trimmed result is empty (the client's own canSend() gate is UX only; this
 * is the enforcement, mirroring how handleSubmitLoadout re-validates behind
 * the deckbuilder's own gate). From that point the two paths converge into
 * one ChatMessage with one field set — nothing on the built message marks
 * which kind it was (D-12's "one log" framing; 03-UI-SPEC.md's no-visual-
 * distinction rule).
 */
export function handleChatSend(
  state: RoomState | null,
  message: Extract<ClientMessage, { type: 'CHAT_SEND' }>,
  connectionId: string,
  now: number,
  rng: RngState,
): ChatSendResult {
  if (!state) return { state: null, toSender: null, broadcast: null };

  const seat = seatFor(state, connectionId);
  if (!seat || !seat.playerId || !seat.codename) {
    return { state, toSender: null, broadcast: null };
  }

  const rejected: ChatSendResult = {
    state,
    toSender: { type: 'CHAT_REJECTED', message: 'Message not sent — try again.' },
    broadcast: null,
  };

  let text: string;
  if (message.promptId !== undefined) {
    const resolved = promptText(message.promptId);
    if (resolved === null) return rejected;
    text = resolved;
  } else if (message.text !== undefined) {
    const trimmed = message.text.trim();
    if (trimmed.length === 0) return rejected;
    text = trimmed;
  } else {
    // Unreachable given clientMessageSchema's superRefine (exactly one of
    // text/promptId is always present) — kept as a defensive rejection
    // rather than a throw, matching this handler's other rejection paths.
    return rejected;
  }

  const built: ChatMessage = {
    id: mintToken(rng),
    scope: chatScopeFor(state.phase),
    codename: seat.codename,
    text,
    at: now,
  };

  return { state: appendChat(state, built), toSender: null, broadcast: built };
}

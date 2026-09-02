import { seedRng } from '@berlin/engine';
import type { AIAgent } from '@berlin/ai';
import { clientMessageSchema } from '@berlin/shared';
import type { RngState } from '@berlin/shared';
import type * as Party from 'partykit/server';
import { decideForBotSeats, releaseBotSubmissions } from './bots.js';
import {
  sendChat,
  sendChatHistory,
  sendClock,
  sendCommitted,
  sendLobby,
  sendResolved,
  sendTo,
  sendViews,
} from './broadcast.js';
import { seatFor } from './auth.js';
import { syncDirectory } from './directoryClient.js';
import {
  handleChatSend,
  handleCreate,
  handleJoin,
  handleKick,
  handleSetCodename,
  handleSetReady,
  handleSetSeatCount,
  handleSubmitLoadout,
  handleSubmitOrder,
} from './handlers.js';
import { newJoinCode } from './joinCode.js';
import { closeRound, shouldCloseRound } from './round.js';
import { startMatch } from './settings.js';
import { DISCONNECT_GRACE_MS, type RoomState } from './state.js';
import { onRoundAlarm, scheduleDisconnectGrace, scheduleRoundDeadline } from './timers.js';

const MINT_ROOM_ID = '_new';
const STATE_KEY = 'state';

/** Permissive for local dev, where apps/web and apps/party run on different
 *  ports/origins. This endpoint returns nothing sensitive — a fresh,
 *  unclaimed join code — so a permissive origin costs nothing here. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * The PartyKit Server for the match room. Per-connection logic lives only in
 * the message and close handlers — never the connect handler — because
 * Durable Objects can hibernate between messages, and this project's 90s
 * order window (D-04) is exactly the kind of idle gap where that happens
 * (01-RESEARCH.md Pitfall 3).
 * RoomState is persisted to `this.room.storage` after every mutation and
 * rehydrated in onStart for the same reason.
 */
export default class MatchRoom implements Party.Server {
  state: RoomState | null = null;

  /**
   * Bot AIAgent instances, keyed by playerId — cached here so belief state
   * persists across rounds within a match (apps/party/src/CLAUDE.md rule 5
   * pairs with @berlin/ai's own belief accumulation). Never persisted to
   * storage: after a hibernation, a fresh MatchRoom instance starts with an
   * empty cache and decideForBotSeats re-derives each agent from the same
   * `${matchId}:${playerId}` seed on its next decision — deterministic, but
   * belief resets to its prior (empty) state across that gap, an accepted
   * consequence of not persisting AI internals this phase.
   */
  private readonly botAgents = new Map<string, AIAgent>();

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    const stored = await this.room.storage.get<RoomState>(STATE_KEY);
    this.state = stored ?? null;
  }

  /**
   * Plain HTTP entry point. The only route served here is the join-code
   * mint at room id `_new`: it hands the client a fresh, curated-alphabet
   * code before any WebSocket connection exists, so the client's first real
   * connection can target `room: <that code>` directly, and CREATE's
   * onMessage handler below adopts that id as the match code with no
   * cross-room migration required.
   *
   * apps/web (port 3000) and apps/party (port 1999) are different origins in
   * local dev, so this plain-HTTP endpoint needs explicit CORS headers —
   * WebSocket connections aren't subject to the same-origin policy, so
   * onMessage above needs none of this.
   */
  onRequest(req: Party.Request): Response | Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (this.room.id !== MINT_ROOM_ID || req.method !== 'POST') {
      return new Response('Not found', { status: 404, headers: CORS_HEADERS });
    }
    const code = newJoinCode(freshRng());
    return Response.json({ code }, { headers: CORS_HEADERS });
  }

  async onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      sendTo(sender, { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Malformed frame.' });
      return;
    }

    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      sendTo(sender, { type: 'ERROR', code: 'BAD_MESSAGE', message: 'Malformed frame.' });
      return;
    }

    const message = parsed.data;
    const rng = freshRng();
    const now = Date.now();

    if (message.type === 'CREATE') {
      const result = handleCreate(this.room.id, message.codename, sender.id, rng);
      await this.persist(result.state);
      if (result.state) await this.syncAlarm(result.state);
      sendTo(sender, result.toSender);
      if (result.chatHistory) sendChatHistory(sender, result.chatHistory.scope, result.chatHistory.messages);
      if (result.broadcastRoomState && result.state) sendLobby(this.room, result.state);
      await this.pushDirectory(result.state);
      return;
    }

    if (message.type === 'JOIN') {
      const result = handleJoin(this.state, message, sender.id, rng, now);
      await this.persist(result.state);
      if (result.state) await this.syncAlarm(result.state);
      sendTo(sender, result.toSender);
      if (result.chatHistory) sendChatHistory(sender, result.chatHistory.scope, result.chatHistory.messages);
      if (result.broadcastRoomState && result.state) sendLobby(this.room, result.state);
      await this.pushDirectory(result.state);
      return;
    }

    if (message.type === 'SET_READY') {
      const next = handleSetReady(this.state, message.ready, sender.id, now);
      await this.persist(next);
      if (next) {
        await this.syncAlarm(next);
        sendLobby(this.room, next);
      }
      await this.pushDirectory(next);
      return;
    }

    if (message.type === 'SET_CODENAME') {
      const next = handleSetCodename(this.state, message.codename, sender.id, now);
      await this.persist(next);
      if (next) {
        await this.syncAlarm(next);
        sendLobby(this.room, next);
      }
      await this.pushDirectory(next);
      return;
    }

    if (message.type === 'SET_SEAT_COUNT') {
      // The first host-only message in the codebase (apps/party/CLAUDE.md
      // rule 5). Modelled on the SET_READY branch above, with one addition:
      // the returned state's reference identity is the broadcast guard —
      // handleSetSeatCount/setSeatCount return the exact input `state` when
      // the change is illegal or already applied, so a repeated identical
      // value (or a rejected change) fires no duplicate ROOM_STATE or
      // directory frame, while a genuine rejection reply still reaches the
      // sender either way.
      const before = this.state;
      const result = handleSetSeatCount(this.state, message.count, sender.id, now);
      await this.persist(result.state);
      if (result.toSender) sendTo(sender, result.toSender);
      if (result.state && result.state !== before) {
        await this.syncAlarm(result.state);
        sendLobby(this.room, result.state);
        // Keeps the directory's seatsTotal in sync with a host-driven
        // resize, exactly like every other seat/phase-affecting branch.
        await this.pushDirectory(result.state);
      }
      return;
    }

    if (message.type === 'KICK') {
      const before = this.state;
      const result = handleKick(this.state, message.seatIndex, sender.id, now);
      await this.persist(result.state);
      if (result.toSender) sendTo(sender, result.toSender);
      if (result.state && result.state !== before) {
        await this.syncAlarm(result.state);
        // The kicked player is told before the room is told — their client
        // can begin its redirect while the remaining players' seat lists
        // update from the same ROOM_STATE frame.
        if (result.kickedConnectionId) {
          const target = [...this.room.getConnections()].find(
            (c) => c.id === result.kickedConnectionId,
          );
          if (target) {
            sendTo(target, {
              type: 'KICKED',
              reason: 'You were removed from the lobby by the host.',
            });
          }
        }
        sendLobby(this.room, result.state);
        await this.pushDirectory(result.state);
      }
      return;
    }

    if (message.type === 'SUBMIT_LOADOUT') {
      const result = handleSubmitLoadout(this.state, message, sender.id);
      await this.persist(result.state);
      if (result.toSender) sendTo(sender, result.toSender);
      // No sendLobby here — a loadout write changes nothing in the public
      // snapshot (T-2-03), and no syncAlarm either — no timer changed.
      return;
    }

    if (message.type === 'CHAT_SEND') {
      const result = handleChatSend(this.state, message, sender.id, now, rng);
      await this.persist(result.state);
      if (result.toSender) sendTo(sender, result.toSender);
      // No syncAlarm here — no timer changed. No sendLobby — the public
      // lobby snapshot carries nothing derived from chat. No pushDirectory
      // — the directory's four fields are unaffected by a chat message.
      if (result.broadcast) sendChat(this.room, result.broadcast);
      return;
    }

    // message.type === 'SUBMIT_ORDER'
    const result = handleSubmitOrder(this.state, message, sender.id);
    await this.persist(result.state);
    if (result.toSender) sendTo(sender, result.toSender);
    if (result.acceptedFor && result.state?.gameState) {
      sendCommitted(this.room, result.state.gameState, result.acceptedFor);
      if (shouldCloseRound(result.state)) {
        const resolved = closeRound(result.state, 'ALL_COMMITTED');
        const closed =
          resolved.phase === 'IN_GAME'
            ? this.decideBotsForRound(scheduleRoundDeadline(resolved, now), now)
            : resolved;
        await this.persist(closed);
        await this.syncAlarm(closed);
        if (closed.gameState) sendResolved(this.room, closed, closed.gameState);
        sendClock(this.room, closed);
      }
    }

    // Self-heal for Pitfall 5 (room.context.parties is undocumented/unreliable
    // inside onAlarm): SUBMIT_ORDER is the first inbound message a match
    // reliably receives after startMatch moves the room to IN_GAME, so
    // pushing here unconditionally re-attempts the onAlarm branch's REMOVE
    // if that alarm-context directory write silently swallowed a throw.
    await this.pushDirectory(result.state);
  }

  /**
   * D-07 supersedes Phase 1 D-11's "no reconnection handling" — a dropped
   * connection now starts a bounded grace window instead of leaving its
   * seat bound to a dead connection id indefinitely. Resolves the seat via
   * seatFor(connectionId), exactly like every inbound handler (apps/party/src/CLAUDE.md
   * rule 2); returns immediately when there is none (an unbound connection
   * closing — e.g. the transient create/join handshake socket — changes
   * nothing). Otherwise: schedule the grace entry, clear this seat's
   * connectionId (so a later seatFor can never resolve a now-dead
   * connection), persist, resync the room's single alarm slot, and
   * broadcast so every remaining player's seat list flips to
   * "Reconnecting…" on the same frame. The directory is deliberately left
   * untouched here — a lobby with a briefly-dropped player is still open
   * and still joinable, and seatsFilled is unchanged because the seat is
   * still occupied.
   */
  async onClose(connection: Party.Connection): Promise<void> {
    if (!this.state) return;
    const seat = seatFor(this.state, connection.id);
    if (!seat) return;

    const now = Date.now();
    const withGrace = scheduleDisconnectGrace(this.state, seat.index, now, DISCONNECT_GRACE_MS);
    const seats = withGrace.seats.map((s) =>
      s.index === seat.index ? { ...s, connectionId: null } : s,
    );
    const next: RoomState = { ...withGrace, seats };

    await this.persist(next);
    await this.syncAlarm(next);
    sendLobby(this.room, next);
  }

  /**
   * The room's single Durable Object alarm slot serves two different
   * timers depending on phase — the lobby countdown (LOBBY/LOADOUT) and the
   * round deadline (IN_GAME) — never both at once, so branching on phase is
   * sufficient to route a firing correctly.
   *
   * LOBBY/LOADOUT: delegates the entire LOADOUT -> IN_GAME transition to
   * apps/party/src/settings.ts's startMatch — the sole match-construction
   * call site in the codebase — then schedules and syncs the first round's
   * deadline so play begins with a live clock. startMatch's own idempotence
   * guard makes this safe to call even if the alarm somehow double-fires.
   *
   * IN_GAME: delegates to timers.ts's onRoundAlarm, whose own guards make a
   * stale or duplicate delivery a no-op and resolve a given round exactly
   * once regardless of how many times this fires.
   */
  async onAlarm(): Promise<void> {
    if (!this.state) return;
    const now = Date.now();

    if (this.state.phase === 'LOBBY' || this.state.phase === 'LOADOUT') {
      const started = startMatch(this.state, now);
      const startedGameState = started.gameState;
      if (started.phase !== 'IN_GAME' || !startedGameState) {
        await this.persist(started);
        return;
      }
      const withBots = this.decideBotsForRound(scheduleRoundDeadline(started, now), now);
      await this.persist(withBots);
      await this.syncAlarm(withBots);
      sendLobby(this.room, withBots);
      sendViews(this.room, withBots, startedGameState);
      sendClock(this.room, withBots);
      // Pushed after the post-startMatch state is persisted, so the REMOVE
      // this sends reflects the room's new IN_GAME phase (03-01-PLAN.md
      // Task 2). room.context.parties is documented as unreliable inside
      // onAlarm (Pitfall 5) — the SUBMIT_ORDER self-heal above covers a
      // silent failure here.
      await this.pushDirectory(withBots);
      return;
    }

    if (this.state.phase === 'IN_GAME') {
      const before = this.state;

      // Release any bot orders whose padded think-time has elapsed —
      // through the identical submitOrder() path a human's SUBMIT_ORDER
      // uses (apps/party/src/CLAUDE.md rule 3).
      const { state: released, released: releasedSeats } = releaseBotSubmissions(before, now);
      for (const playerId of releasedSeats) {
        if (released.gameState) sendCommitted(this.room, released.gameState, playerId);
      }

      let working = released;
      let closedThisTick = false;
      if (shouldCloseRound(working)) {
        working = closeRound(working, 'ALL_COMMITTED');
        closedThisTick = true;
        if (working.phase === 'IN_GAME') working = scheduleRoundDeadline(working, now);
      } else {
        // onRoundAlarm itself no-ops on a stale/duplicate delivery (now <
        // deadlineAt, or no deadline scheduled), and otherwise closes +
        // reschedules — the reference check below detects which happened.
        const afterAlarm = onRoundAlarm(working, now);
        if (afterAlarm !== working) {
          working = afterAlarm;
          closedThisTick = true;
        }
      }

      if (closedThisTick) {
        if (working.phase === 'IN_GAME') {
          working = this.decideBotsForRound(working, now);
        }
        await this.persist(working);
        await this.syncAlarm(working);
        if (working.gameState) sendResolved(this.room, working, working.gameState);
        sendClock(this.room, working);
        // Covers the round-close-into-victory case: closeRound() can move
        // `working.phase` to ENDED here, which syncDirectory's own
        // commandFor() treats identically to IN_GAME (REMOVE) — this call
        // is a no-op UPSERT-avoiding safety net, not a second code path.
        await this.pushDirectory(working);
        return;
      }

      // Nothing closed this tick — persist any bot releases and reschedule
      // for the next earliest pending event (a bot's releaseAt, or the
      // round deadline).
      if (working !== before) {
        await this.persist(working);
        await this.syncAlarm(working);
      }
    }
  }

  private async persist(state: RoomState | null): Promise<void> {
    this.state = state;
    if (state) await this.room.storage.put(STATE_KEY, state);
  }

  /**
   * Pushes this room's public lobby metadata into the directory party — a
   * thin no-op-on-null wrapper over directoryClient.ts's syncDirectory, so
   * every call site below can call it unconditionally regardless of whether
   * its own handler produced a state. Called at the tail of every branch
   * that can change a seat, the seat count, or the phase (03-01-PLAN.md
   * Task 2): CREATE, JOIN, SET_READY, SET_CODENAME, both onAlarm branches,
   * and (as the Pitfall-5 self-heal) SUBMIT_ORDER. Deliberately NOT called
   * from SUBMIT_LOADOUT — a loadout write changes nothing in the public
   * snapshot (T-2-03).
   */
  private async pushDirectory(state: RoomState | null): Promise<void> {
    if (!state) return;
    await syncDirectory(this.room, state);
  }

  /**
   * Decides this round's bot orders and stores them as pending
   * BotSubmissions — deciding is immediate, releasing is scheduled
   * (timers.ts botDelayMs). The RNG is seeded from `${matchId}:bots:${round}`,
   * not freshRng()'s crypto source: apps/party/src/CLAUDE.md rule 9 bans
   * ambient randomness here too, and a fixed per-round seed is what makes
   * two rooms built from the same room id decide identical bot orders.
   */
  private decideBotsForRound(state: RoomState, now: number): RoomState {
    if (!state.gameState) return state;
    const rng = seedRng(`${state.matchId}:bots:${state.gameState.round}`);
    const botSubmissions = decideForBotSeats(state, now, rng, this.botAgents);
    return { ...state, botSubmissions };
  }

  /**
   * Mirrors the room's active timer(s) into a real Durable Object alarm.
   * Called unconditionally is intentional and safe: setAlarm with the same
   * target time is idempotent, and deleteAlarm on a room with no alarm
   * scheduled is a no-op — so this never needs to diff against the
   * previous value.
   */
  private async syncAlarm(state: RoomState): Promise<void> {
    const target = this.alarmTarget(state);
    if (target !== null) {
      await this.room.storage.setAlarm(target);
    } else {
      await this.room.storage.deleteAlarm();
    }
  }

  /**
   * The single Durable Object alarm slot's next-firing target, covering
   * every phase (Task 2 — this used to be IN_GAME-only `roundAlarmTarget`,
   * branched around in `syncAlarm`; a disconnect can happen from a lobby
   * just as easily as from a live match, so the grace-expiry candidate
   * belongs in every phase, not only IN_GAME). Candidates: `startsAt`
   * during LOBBY/LOADOUT; `deadlineAt` and every queued bot submission's
   * `releaseAt` during IN_GAME; every `disconnectedSeats[].graceExpiresAt`
   * in ANY phase. Returns the earliest of whichever candidates apply, or
   * null when there are none — the room's alarm must fire for whichever
   * event comes first, exactly as it already does for the deadline-versus-
   * bot-release pair.
   */
  private alarmTarget(state: RoomState): number | null {
    const targets: number[] = [];
    if (state.phase === 'LOBBY' || state.phase === 'LOADOUT') {
      if (state.startsAt !== null) targets.push(state.startsAt);
    }
    if (state.phase === 'IN_GAME') {
      if (state.deadlineAt !== null) targets.push(state.deadlineAt);
      for (const submission of state.botSubmissions) targets.push(submission.releaseAt);
    }
    for (const grace of state.disconnectedSeats) targets.push(grace.graceExpiresAt);
    return targets.length > 0 ? Math.min(...targets) : null;
  }
}

/**
 * Every inbound message gets a freshly seeded RNG from the engine's own
 * seedRng — never the platform's global random source, which stays banned
 * here exactly as it is everywhere below apps/. Seeded from
 * crypto.randomUUID(), a cryptographically strong source, not the banned one.
 */
function freshRng(): RngState {
  return seedRng(crypto.randomUUID());
}

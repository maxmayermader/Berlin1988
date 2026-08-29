import { seedRng } from '@berlin/engine';
import type { AIAgent } from '@berlin/ai';
import { clientMessageSchema } from '@berlin/shared';
import type { RngState } from '@berlin/shared';
import type * as Party from 'partykit/server';
import { decideForBotSeats, releaseBotSubmissions } from './bots.js';
import { sendClock, sendCommitted, sendLobby, sendResolved, sendTo, sendViews } from './broadcast.js';
import {
  handleCreate,
  handleJoin,
  handleSetCodename,
  handleSetReady,
  handleSubmitLoadout,
  handleSubmitOrder,
} from './handlers.js';
import { newJoinCode } from './joinCode.js';
import { closeRound, shouldCloseRound } from './round.js';
import { startMatch } from './settings.js';
import type { RoomState } from './state.js';
import { onRoundAlarm, scheduleRoundDeadline } from './timers.js';

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
      if (result.broadcastRoomState && result.state) sendLobby(this.room, result.state);
      return;
    }

    if (message.type === 'JOIN') {
      const result = handleJoin(this.state, message, sender.id, rng, now);
      await this.persist(result.state);
      if (result.state) await this.syncAlarm(result.state);
      sendTo(sender, result.toSender);
      if (result.broadcastRoomState && result.state) sendLobby(this.room, result.state);
      return;
    }

    if (message.type === 'SET_READY') {
      const next = handleSetReady(this.state, message.ready, sender.id, now);
      await this.persist(next);
      if (next) {
        await this.syncAlarm(next);
        sendLobby(this.room, next);
      }
      return;
    }

    if (message.type === 'SET_CODENAME') {
      const next = handleSetCodename(this.state, message.codename, sender.id, now);
      await this.persist(next);
      if (next) {
        await this.syncAlarm(next);
        sendLobby(this.room, next);
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
  }

  onClose(): void {
    // No reconnection handling in Phase 1 (D-11) — an accepted, documented
    // gap, not a bug. A dropped connection simply leaves its seat bound to a
    // now-dead connection id until the room is next touched.
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
   * Mirrors the room's active timer into a real Durable Object alarm:
   * RoomState.startsAt during LOBBY/LOADOUT, or — during IN_GAME — the
   * earlier of the round deadline and the next queued bot release, since
   * the room's single alarm slot must fire for whichever comes first.
   * Called unconditionally is intentional and safe: setAlarm with the same
   * target time is idempotent, and deleteAlarm on a room with no alarm
   * scheduled is a no-op — so this never needs to diff against the
   * previous value.
   */
  private async syncAlarm(state: RoomState): Promise<void> {
    const target = state.phase === 'IN_GAME' ? this.roundAlarmTarget(state) : state.startsAt;
    if (target !== null) {
      await this.room.storage.setAlarm(target);
    } else {
      await this.room.storage.deleteAlarm();
    }
  }

  private roundAlarmTarget(state: RoomState): number | null {
    const targets: number[] = [];
    if (state.deadlineAt !== null) targets.push(state.deadlineAt);
    for (const submission of state.botSubmissions) targets.push(submission.releaseAt);
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

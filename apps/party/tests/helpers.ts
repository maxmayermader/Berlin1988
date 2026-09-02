import {
  DIRECTORY_PARTY_NAME,
  directoryCommandSchema,
  type ClientMessage,
  type DirectoryCommand,
  type ServerMessage,
} from '@berlin/shared';
import type * as Party from 'partykit/server';
import { vi } from 'vitest';
import { bindConnection } from '../src/auth.js';
import LobbyDirectory from '../src/directory.js';
import MatchRoom from '../src/room.js';
import type { BotSubmission, RoomState } from '../src/state.js';

/** Test-only fake connection with no real send target — used by holdSeat()
 *  below, which never reads the frames it receives. */
interface FakeConnection {
  readonly id: string;
  send(payload: string): void;
}

/**
 * Simulated-connection harness for the room, mirroring
 * packages/engine/tests/helpers.ts: no real WebSocket, no network. Not a
 * test — a fixture used by the *.test.ts files in this folder.
 */

/**
 * Storage stub extended (Plan 01-02) with the alarm trio so room.ts's
 * countdown scheduling doesn't throw against this fake: setAlarm/deleteAlarm
 * just record the target time, they never fire on their own. Tests that
 * need to observe "the alarm fired" use `TestRoom.triggerAlarm()` below to
 * invoke the room's onAlarm directly, rather than waiting out the real
 * 10-second countdown duration.
 */
class FakeStorage {
  private readonly store = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
  async setAlarm(time: number | Date): Promise<void> {
    this.alarmAt = typeof time === 'number' ? time : time.getTime();
  }
  async deleteAlarm(): Promise<void> {
    this.alarmAt = null;
  }
  async getAlarm(): Promise<number | null> {
    return this.alarmAt;
  }
}

export interface TestConnection {
  readonly id: string;
  /** Every frame this connection has received, in arrival order. */
  readonly received: ServerMessage[];
  send(message: ClientMessage): Promise<void>;
  /** The most recently received frame, if any. */
  last(): ServerMessage | undefined;
  /** Simulates this connection dropping — invokes the room's onClose
   *  handler directly with this connection, exactly like a real closed
   *  WebSocket would (03-04-PLAN.md Task 2). The connection is removed from
   *  the room's connection set first, mirroring PartyKit's own behaviour
   *  (a closed connection no longer appears in room.getConnections() by the
   *  time onClose runs), so any sendLobby the handler triggers cannot
   *  attempt to write back to this now-dead connection. */
  close(): Promise<void>;
}

export interface TestRoom {
  readonly id: string;
  connect(codename?: string): TestConnection;
  /** Invokes the room's onAlarm handler directly, bypassing any real timer —
   *  the countdown duration is 10s and tests must not wait on it. */
  triggerAlarm(): Promise<void>;
  /**
   * Test-only: submits a HOLD order for every live agent of the seat at
   * `seatIndex`, through the identical onMessage -> handleSubmitOrder path a
   * human connection uses — via a fake connection bound directly to that
   * seat (bots have no WebSocket connection in production either; Task 3's
   * decideForBotSeats calls the same underlying submitOrder path this
   * mimics). Exists so a round can close end-to-end in tests written before
   * Task 3 wires real AI-decided bot submissions, without bypassing the
   * room's own handler.
   */
  holdSeat(seatIndex: number): Promise<void>;
  /**
   * The room's own live RoomState, exactly as apps/party/src/room.ts holds
   * it — the same object the fixture's private MatchRoom instance reads and
   * writes. Not a wire type: fog-wire.test.ts reads this to derive the
   * expected-secret values it scans literal outbound frames for, mirroring
   * how packages/engine/tests/fog-leak.test.ts reads GameState directly
   * rather than from a hardcoded fixture. Returns null before CREATE.
   */
  roomState(): RoomState | null;
  /**
   * Whether the fake Durable Object storage currently has a pending alarm —
   * added for 01-06's "the room stops scheduling round alarms once the
   * match has ended" truth. Reads the same FakeStorage.getAlarm() room.ts
   * itself calls indirectly via syncAlarm(), so this observes exactly what
   * a real Durable Object's own getAlarm() would report.
   */
  alarmScheduled(): Promise<boolean>;
  /** The fake Durable Object storage's raw scheduled alarm time, or null —
   *  unlike alarmScheduled()'s boolean, this exposes the actual target so a
   *  test can assert WHICH candidate (a round deadline, a bot release, a
   *  countdown, or — Task 2 — a disconnect-grace expiry) won the room's
   *  single-slot Math.min (03-04-PLAN.md Task 2). */
  alarmAt(): Promise<number | null>;
  /** Every DirectoryCommand this room's syncDirectory() calls have
   *  successfully parsed and sent to the fake directory party, in send
   *  order — 03-01-PLAN.md Task 1. */
  directoryCommands(): DirectoryCommand[];
  /** Simulates PartyKit's documented onAlarm-context limitation: while
   *  `broken` is true, this room's `context` getter throws on access,
   *  exactly like a real Durable Object's `room.context.parties` inside
   *  onAlarm. syncDirectory's own try/catch must swallow that throw — Task
   *  2's self-heal test flips this on, drives the room to IN_GAME, then
   *  flips it back off before asserting the next message heals the
   *  directory's stale entry. */
  setDirectoryBroken(broken: boolean): void;
}

let seq = 0;

/**
 * Creates an in-process MatchRoom. `id` deliberately does not look like a
 * join code (6 upper-case alphanumerics) — mirroring the in-process room a
 * client first connects to via a not-yet-code-shaped id, so CREATE mints a
 * fresh code exactly as it would via the `_new` HTTP mint endpoint in
 * production.
 *
 * onStart is not invoked here: MatchRoom's `state` field defaults to `null`
 * via its own field initializer, CREATE never reads it, and JOIN is only
 * ever sent in these tests after a CREATE has been awaited to completion —
 * so there is no race to guard against skipping it.
 */
export function createTestRoom(id = 'test-room'): TestRoom {
  const connections = new Map<string, FakeConnection>();
  const storage = new FakeStorage();
  const directoryCommandLog: DirectoryCommand[] = [];
  let directoryBroken = false;

  /**
   * A minimal fake of `room.context.parties[DIRECTORY_PARTY_NAME]` — just
   * enough surface for directoryClient.ts's syncDirectory to POST against
   * (`.get(id).fetch(init)`), recording every successfully-parsed
   * DirectoryCommand it receives rather than forwarding it to a real
   * LobbyDirectory instance (createTestDirectory below exercises that class
   * directly). `context` is a getter, not a plain field, so
   * setDirectoryBroken can make *accessing* it throw — mirroring PartyKit's
   * documented onAlarm-context limitation, not merely a failed fetch.
   */
  const fakeRoom = {
    id,
    storage,
    getConnections: () => connections.values(),
    get context() {
      if (directoryBroken) {
        throw new Error('context unavailable (onAlarm limitation, simulated)');
      }
      return {
        parties: {
          [DIRECTORY_PARTY_NAME]: {
            get(_directoryRoomId: string) {
              return {
                async fetch(pathOrInit?: unknown): Promise<Response> {
                  const init = pathOrInit as { body?: unknown } | undefined;
                  const raw = typeof init?.body === 'string' ? init.body : '';
                  let json: unknown;
                  try {
                    json = JSON.parse(raw);
                  } catch {
                    return new Response(null, { status: 400 });
                  }
                  const parsed = directoryCommandSchema.safeParse(json);
                  if (!parsed.success) return new Response(null, { status: 400 });
                  directoryCommandLog.push(parsed.data);
                  return new Response(null, { status: 204 });
                },
              };
            },
          },
        },
      };
    },
  } as unknown as Party.Room;

  const instance = new MatchRoom(fakeRoom);

  return {
    id,
    roomState(): RoomState | null {
      return instance.state;
    },
    async alarmScheduled(): Promise<boolean> {
      return (await storage.getAlarm()) !== null;
    },
    async alarmAt(): Promise<number | null> {
      return storage.getAlarm();
    },
    directoryCommands(): DirectoryCommand[] {
      return [...directoryCommandLog];
    },
    setDirectoryBroken(broken: boolean): void {
      directoryBroken = broken;
    },
    async triggerAlarm(): Promise<void> {
      await instance.onAlarm?.();
    },
    /**
     * Submits a HOLD order for every live agent of the seat at `seatIndex`,
     * through the identical onMessage -> handleSubmitOrder path a human
     * connection uses. Binds a fresh fake connection directly to the seat
     * (bots have no WebSocket connection in production either — Task 3's
     * decideForBotSeats calls the underlying submitOrder path this mimics,
     * not this helper) via the same bindConnection() the JOIN handler uses,
     * so a round can close end-to-end in tests written before Task 3 wires
     * real AI-decided bot submissions, without bypassing the room's own
     * handler.
     */
    async holdSeat(seatIndex: number): Promise<void> {
      const before = instance.state;
      const gameStateBefore = before?.gameState;
      if (!before || !gameStateBefore) return;
      const seat = before.seats[seatIndex];
      if (!seat?.playerId) return;

      const connId = `hold-${++seq}`;
      const fakeConnection: FakeConnection = {
        id: connId,
        send() {
          // holdSeat's caller never reads these frames.
        },
      };
      connections.set(connId, fakeConnection);
      instance.state = bindConnection(before, connId, seatIndex);

      const player = gameStateBefore.players[seat.playerId];
      const liveAgents = player?.agents.filter((a) => a.alive) ?? [];
      for (const agent of liveAgents) {
        const current = instance.state?.gameState;
        if (!current) break;
        const message: ClientMessage = {
          type: 'SUBMIT_ORDER',
          round: current.round,
          agentId: agent.id,
          actions: [{ type: 'HOLD' }],
        };
        await instance.onMessage?.(
          JSON.stringify(message),
          fakeConnection as unknown as Party.Connection,
        );
      }
    },
    connect(_codename?: string): TestConnection {
      const connId = `conn-${++seq}`;
      const received: ServerMessage[] = [];
      const fakeConnection = {
        id: connId,
        send(payload: string) {
          received.push(JSON.parse(payload) as ServerMessage);
        },
      };
      connections.set(connId, fakeConnection);

      return {
        id: connId,
        received,
        async send(message: ClientMessage) {
          await instance.onMessage?.(
            JSON.stringify(message),
            fakeConnection as unknown as Party.Connection,
          );
        },
        last(): ServerMessage | undefined {
          return received[received.length - 1];
        },
        async close(): Promise<void> {
          connections.delete(connId);
          await instance.onClose?.(fakeConnection as unknown as Party.Connection);
        },
      };
    },
  };
}

export interface TestDirectoryConnection {
  readonly id: string;
  readonly received: ServerMessage[];
  /** The most recently received frame, if any. */
  last(): ServerMessage | undefined;
}

export interface TestDirectory {
  /** Invokes LobbyDirectory.onRequest directly with a POST body. `body` is
   *  JSON.stringify'd automatically unless it's already a string — passing
   *  a raw string lets hostile-input tests (Task 3) send genuinely
   *  malformed bodies that no well-typed DirectoryCommand could produce. */
  post(body: unknown, method?: string): Promise<Response>;
  /** Invokes LobbyDirectory.onConnect against a recording fake connection
   *  and returns it — the connection's first received frame is always the
   *  DIRECTORY_STATE snapshot onConnect sends. */
  connect(): TestDirectoryConnection;
}

/**
 * A much smaller harness than createTestRoom's: the directory has no
 * seats, no alarm, no bot loop — just onRequest and onConnect over its own
 * fake room + FakeStorage. onStart is not invoked here for the same reason
 * createTestRoom skips it: a fresh LobbyDirectory's `entries` map already
 * defaults to empty via its own field initializer, and every test either
 * starts from that empty state or builds it up through `post()` calls made
 * after this factory returns — there is nothing on disk yet to rehydrate.
 */
export function createTestDirectory(): TestDirectory {
  const storage = new FakeStorage();
  const connections = new Map<string, FakeConnection>();

  const fakeRoom = {
    id: 'lobby-directory',
    storage,
    getConnections: () => connections.values(),
  } as unknown as Party.Room;

  const instance = new LobbyDirectory(fakeRoom);

  return {
    async post(body: unknown, method = 'POST'): Promise<Response> {
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      const req = { method, text: async () => text } as unknown as Party.Request;
      return instance.onRequest(req);
    },
    connect(): TestDirectoryConnection {
      const connId = `dir-conn-${++seq}`;
      const received: ServerMessage[] = [];
      const fakeConnection = {
        id: connId,
        send(payload: string) {
          received.push(JSON.parse(payload) as ServerMessage);
        },
      };
      connections.set(connId, fakeConnection);
      instance.onConnect?.(fakeConnection as unknown as Party.Connection);
      return {
        id: connId,
        received,
        last(): ServerMessage | undefined {
          return received[received.length - 1];
        },
      };
    },
  };
}

/** Every frame a connection has received, in arrival order — the literal
 *  wire payloads fog-wire.test.ts scans. A thin, named wrapper over
 *  TestConnection.received so call sites read as intent rather than
 *  reaching into the fixture's internals. */
export function allFrames(conn: TestConnection): readonly ServerMessage[] {
  return conn.received;
}

/** One round's worth of what fog-wire.test.ts needs to prove the order
 *  phase never leaked: the frames the host connection received strictly
 *  between this round starting and its own ROUND_RESOLVED frame
 *  (exclusive of that frame), the raw bot submissions decided for the
 *  round before release (for the timing and determinism checks), and the
 *  MOVE.to / STRIKE.target node ids drawn from them (for the order-phase
 *  leak check). */
export interface RoundRecord {
  readonly round: number;
  readonly framesDuringOrders: readonly ServerMessage[];
  readonly botSubmissions: readonly BotSubmission[];
  readonly botOrderTargets: readonly string[];
  /** deadlineAt - roundTimerSeconds*1000 — the `now` the round's bot
   *  submissions were decided against, for the 1500ms floor check. Null
   *  only if the round somehow closed with no deadline ever scheduled. */
  readonly roundStartAt: number | null;
}

export interface PlayedMatch {
  readonly host: TestConnection;
  readonly rounds: readonly RoundRecord[];
}

/**
 * Drives a 1-human/3-bot room from CREATE through `rounds` rounds of play,
 * entirely through the room's own deadline path — no human order is ever
 * submitted, so every round closes via auto-Hold (apps/party/src/CLAUDE.md
 * rule 6). Deliberately the least-privileged path: if fog holds when the
 * human never even orders, it holds a fortiori once Plan 01-04 wires a real
 * composer.
 *
 * Requires the caller to already be under vi.useFakeTimers() (mirrors
 * clock.test.ts's own beforeEach) — advancing a 90-second deadline `rounds`
 * times over needs system-time control, not `rounds` real 90-second waits.
 */
export async function playMatch(room: TestRoom, rounds: number): Promise<PlayedMatch> {
  const host = room.connect('Vogel');
  await host.send({ type: 'CREATE', codename: 'Vogel' });
  await host.send({ type: 'SET_READY', ready: true });
  await room.triggerAlarm(); // countdown expiry -> startMatch + round-1 bots decided

  const records: RoundRecord[] = [];
  for (let i = 0; i < rounds; i++) {
    const before = room.roomState();
    const gameStateBefore = before?.gameState;
    const round = gameStateBefore?.round ?? 0;
    const deadlineAt = before?.deadlineAt ?? null;
    const roundTimerSeconds = gameStateBefore?.settings.roundTimerSeconds ?? null;
    const roundStartAt =
      deadlineAt !== null && roundTimerSeconds !== null ? deadlineAt - roundTimerSeconds * 1000 : null;

    const botSubmissions = before?.botSubmissions ?? [];
    const botOrderTargets: string[] = [];
    for (const submission of botSubmissions) {
      for (const action of submission.order.actions) {
        if (action.type === 'MOVE') botOrderTargets.push(String(action.to));
        if (action.type === 'STRIKE') botOrderTargets.push(String(action.target));
      }
    }

    const startIndex = host.received.length;
    if (deadlineAt !== null) vi.setSystemTime(deadlineAt + 1);
    await room.triggerAlarm(); // releases any still-pending bot submissions, then closes via DEADLINE

    const framesThisRound = host.received.slice(startIndex);
    const resolvedIndex = framesThisRound.findIndex((f) => f.type === 'ROUND_RESOLVED');
    const framesDuringOrders =
      resolvedIndex === -1 ? framesThisRound : framesThisRound.slice(0, resolvedIndex);

    records.push({ round, framesDuringOrders, botSubmissions, botOrderTargets, roundStartAt });
  }

  return { host, rounds: records };
}

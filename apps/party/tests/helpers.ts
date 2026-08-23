import type { ClientMessage, ServerMessage } from '@berlin/shared';
import type * as Party from 'partykit/server';
import { bindConnection } from '../src/auth.js';
import MatchRoom from '../src/room.js';

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

  const fakeRoom = {
    id,
    storage,
    getConnections: () => connections.values(),
  } as unknown as Party.Room;

  const instance = new MatchRoom(fakeRoom);

  return {
    id,
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
      };
    },
  };
}

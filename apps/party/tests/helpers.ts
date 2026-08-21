import type { ClientMessage, ServerMessage } from '@berlin/shared';
import type * as Party from 'partykit/server';
import MatchRoom from '../src/room.js';

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
  const connections = new Map<string, { send(payload: string): void }>();
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
      // Cast to the interface: onAlarm is optional on Party.Server and not
      // yet declared on MatchRoom until Plan 01-02 Task 3 wires match
      // start. Calling it here is a no-op until then.
      await (instance as Party.Server).onAlarm?.();
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

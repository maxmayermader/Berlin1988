import type { ClientMessage, ServerMessage } from '@berlin/shared';
import type * as Party from 'partykit/server';
import MatchRoom from '../src/room.js';

/**
 * Simulated-connection harness for the room, mirroring
 * packages/engine/tests/helpers.ts: no real WebSocket, no network. Not a
 * test — a fixture used by the *.test.ts files in this folder.
 */

class FakeStorage {
  private readonly store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
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

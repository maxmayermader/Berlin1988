import {
  directoryEntrySchema,
  serverMessageSchema,
  type DirectoryEntry,
} from '@berlin/shared';
import type * as Party from 'partykit/server';
import { describe, expect, it } from 'vitest';
import { syncDirectory } from '../src/directoryClient.js';
import { emptySeats, type RoomState } from '../src/state.js';
import { createTestDirectory, createTestRoom } from './helpers.js';

/**
 * Covers 03-01-PLAN.md Task 1's <behavior> block end to end: a match room's
 * CREATE registers a directory entry, the directory fans DIRECTORY_STATE
 * out correctly (empty, multi-entry, no-op REMOVE), rejects malformed input,
 * and syncDirectory never throws even when room.context.parties is
 * unavailable — the documented onAlarm limitation.
 */

/** A minimal LOBBY RoomState fixture, mirroring lobby.test.ts's own
 *  fixtureState — a single human seat as host, three seats open. */
function lobbyState(overrides: Partial<RoomState> = {}): RoomState {
  const seats = emptySeats();
  const host = seats[0];
  if (!host) throw new Error('emptySeats() returned no seats');
  seats[0] = { ...host, playerId: 'p0', codename: 'Iron Falcon', kind: 'HUMAN' };
  return {
    code: 'ABCDEF',
    matchId: 'ABCDEF',
    phase: 'LOBBY',
    hostPlayerId: 'p0',
    seats,
    startsAt: null,
    gameState: null,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
    ...overrides,
  };
}

function fixtureEntry(overrides: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    code: 'AAAAAA',
    seatsFilled: 1,
    seatsTotal: 4,
    hostCodename: 'Iron Falcon',
    ...overrides,
  };
}

describe('packages/shared directory schemas (P-3-01)', () => {
  it('serverMessageSchema accepts an empty DIRECTORY_STATE frame', () => {
    const parsed = serverMessageSchema.safeParse({ type: 'DIRECTORY_STATE', lobbies: [] });
    expect(parsed.success).toBe(true);
  });

  it('directoryEntrySchema rejects an unrecognised extra key', () => {
    const parsed = directoryEntrySchema.safeParse({
      code: 'ABCDEF',
      seatsFilled: 1,
      seatsTotal: 4,
      hostCodename: 'Iron Falcon',
      round: 3,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('apps/party directoryClient.syncDirectory', () => {
  it('a CREATE with host codename "Iron Falcon" on a 4-seat lobby pushes exactly one UPSERT', async () => {
    const room = createTestRoom();
    const host = room.connect();
    await host.send({ type: 'CREATE', codename: 'Iron Falcon' });

    const commands = room.directoryCommands();
    expect(commands).toHaveLength(1);
    const code = room.roomState()?.code;
    expect(commands[0]).toEqual({
      type: 'UPSERT',
      entry: { code, seatsFilled: 1, seatsTotal: 4, hostCodename: 'Iron Falcon' },
    });
  });

  it('resolves without throwing when accessing room.context itself throws (onAlarm limitation)', async () => {
    const throwingRoom = {
      get context(): never {
        throw new Error('context unavailable (onAlarm limitation, simulated)');
      },
    } as unknown as Party.Room;

    await expect(syncDirectory(throwingRoom, lobbyState())).resolves.toBeUndefined();
  });

  it('resolves without throwing when room.context.parties has no directory entry', async () => {
    const bareRoom = { context: { parties: {} } } as unknown as Party.Room;

    await expect(syncDirectory(bareRoom, lobbyState())).resolves.toBeUndefined();
  });
});

describe('apps/party LobbyDirectory', () => {
  it('a newly-connecting client receives an empty DIRECTORY_STATE before any UPSERT', () => {
    const dir = createTestDirectory();
    const conn = dir.connect();
    expect(conn.last()).toEqual({ type: 'DIRECTORY_STATE', lobbies: [] });
  });

  it('two entries with the same hostCodename but different codes both appear, keyed by code', async () => {
    const dir = createTestDirectory();
    await dir.post({ type: 'UPSERT', entry: fixtureEntry({ code: 'AAAAAA' }) });
    await dir.post({ type: 'UPSERT', entry: fixtureEntry({ code: 'BBBBBB' }) });

    const frame = dir.connect().last();
    expect(frame?.type).toBe('DIRECTORY_STATE');
    if (frame?.type !== 'DIRECTORY_STATE') throw new Error('expected DIRECTORY_STATE');
    expect(frame.lobbies).toHaveLength(2);
    expect(frame.lobbies.map((l) => l.code)).toEqual(['AAAAAA', 'BBBBBB']);
  });

  it('a REMOVE for a code the directory has never seen is a no-op and does not throw', async () => {
    const dir = createTestDirectory();
    const res = await dir.post({ type: 'REMOVE', code: 'ZZZZZZ' });
    expect(res.status).toBe(204);
    expect(dir.connect().last()).toEqual({ type: 'DIRECTORY_STATE', lobbies: [] });
  });

  it('a malformed (non-JSON) body is rejected with 400 and stores nothing', async () => {
    const dir = createTestDirectory();
    const res = await dir.post('not json');
    expect(res.status).toBe(400);
    expect(dir.connect().last()).toEqual({ type: 'DIRECTORY_STATE', lobbies: [] });
  });
});

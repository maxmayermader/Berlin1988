import { DEFAULT_LOBBY_SETTINGS } from '@berlin/shared';
import {
  directoryEntrySchema,
  serverMessageSchema,
  type DirectoryCommand,
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
    chat: { LOBBY: [], MATCH: [] },
    settings: DEFAULT_LOBBY_SETTINGS,
    disconnectedSeats: [],
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

/**
 * Covers 03-01-PLAN.md Task 2's <behavior> block: the public list stays
 * live across a seat count change and vanishes at match start, with a
 * proven self-heal for the documented onAlarm room.context limitation
 * (Pitfall 5). Each case replays the room's own recorded DirectoryCommands
 * into a real LobbyDirectory instance (createTestDirectory) so assertions
 * are made against the directory's actual DIRECTORY_STATE, not just the
 * commands sent to it.
 */
describe('apps/party MatchRoom -> LobbyDirectory live updates (Task 2)', () => {
  it('a second JOIN pushes an UPSERT with seatsFilled 2 and does not change row order', async () => {
    const roomA = createTestRoom('room-a');
    const hostA = roomA.connect();
    await hostA.send({ type: 'CREATE', codename: 'Alpha' });
    const codeA = roomA.roomState()?.code;

    const roomB = createTestRoom('room-b');
    const hostB = roomB.connect();
    await hostB.send({ type: 'CREATE', codename: 'Bravo' });
    const codeB = roomB.roomState()?.code;

    const dir = createTestDirectory();
    for (const cmd of roomA.directoryCommands()) await dir.post(cmd);
    for (const cmd of roomB.directoryCommands()) await dir.post(cmd);

    const joiner = roomA.connect();
    await joiner.send({ type: 'JOIN', code: codeA as string, codename: 'Second' });

    const latest = roomA.directoryCommands().at(-1);
    expect(latest).toEqual({
      type: 'UPSERT',
      entry: { code: codeA, seatsFilled: 2, seatsTotal: 4, hostCodename: 'Alpha' },
    });

    await dir.post(latest as DirectoryCommand);
    const frame = dir.connect().last();
    if (frame?.type !== 'DIRECTORY_STATE') throw new Error('expected DIRECTORY_STATE');
    expect(frame.lobbies.map((l) => l.code)).toEqual([codeA, codeB]);
    expect(frame.lobbies[0]?.seatsFilled).toBe(2);
  });

  it('a token rebind JOIN produces an UPSERT whose seatsFilled is unchanged', async () => {
    const room = createTestRoom();
    const host = room.connect();
    await host.send({ type: 'CREATE', codename: 'Iron Falcon' });
    const joined = host.received.find((m) => m.type === 'JOINED');
    if (joined?.type !== 'JOINED') throw new Error('expected JOINED');
    const { code, token } = joined;

    const before = room.directoryCommands().length;
    const reconnect = room.connect();
    await reconnect.send({ type: 'JOIN', code, codename: 'Iron Falcon', token });

    const commands = room.directoryCommands();
    expect(commands.length).toBeGreaterThan(before);
    expect(commands.at(-1)).toEqual({
      type: 'UPSERT',
      entry: { code, seatsFilled: 1, seatsTotal: 4, hostCodename: 'Iron Falcon' },
    });
  });

  it('after the alarm moves the room to IN_GAME and one further message is handled, the code is absent from the directory', async () => {
    const room = createTestRoom();
    const host = room.connect();
    await host.send({ type: 'CREATE', codename: 'Iron Falcon' });
    const code = room.roomState()?.code;
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // countdown expiry -> startMatch, bots fill empty seats

    await room.holdSeat(0); // one further inbound message

    const dir = createTestDirectory();
    for (const cmd of room.directoryCommands()) await dir.post(cmd);
    const frame = dir.connect().last();
    if (frame?.type !== 'DIRECTORY_STATE') throw new Error('expected DIRECTORY_STATE');
    expect(frame.lobbies.find((l) => l.code === code)).toBeUndefined();
  });

  it('self-heals a REMOVE when room.context throws during the alarm-context call (Pitfall 5)', async () => {
    const room = createTestRoom();
    const host = room.connect();
    await host.send({ type: 'CREATE', codename: 'Iron Falcon' });
    const code = room.roomState()?.code;
    await host.send({ type: 'SET_READY', ready: true });

    room.setDirectoryBroken(true);
    await room.triggerAlarm(); // startMatch -> IN_GAME; the REMOVE silently swallowed
    room.setDirectoryBroken(false);

    await room.holdSeat(0); // the self-heal: SUBMIT_ORDER's tail pushDirectory retries

    const commands = room.directoryCommands();
    expect(commands.at(-1)).toEqual({ type: 'REMOVE', code });

    const dir = createTestDirectory();
    for (const cmd of commands) await dir.post(cmd);
    const frame = dir.connect().last();
    if (frame?.type !== 'DIRECTORY_STATE') throw new Error('expected DIRECTORY_STATE');
    expect(frame.lobbies.find((l) => l.code === code)).toBeUndefined();
  });
});

/**
 * Covers 03-01-PLAN.md Task 3's four hostile-input <behavior> bullets plus
 * the method-gate: the directory's one untrusted-input boundary
 * (T-03-02) rejects every malformed command with 400 (or 405 for a
 * non-POST method) and stores nothing — each rejection is paired with an
 * assertion that the directory's subsequent DIRECTORY_STATE is
 * byte-identical to the one before the rejected POST.
 */
describe('apps/party LobbyDirectory hostile-input hardening (Task 3)', () => {
  it('rejects a non-JSON body with 400 and leaves state unchanged', async () => {
    const dir = createTestDirectory();
    await dir.post({ type: 'UPSERT', entry: fixtureEntry() });
    const before = dir.connect().last();

    const res = await dir.post('not json');

    expect(res.status).toBe(400);
    expect(dir.connect().last()).toEqual(before);
  });

  it('rejects a well-formed JSON body with an unknown extra key with 400 and leaves state unchanged', async () => {
    const dir = createTestDirectory();
    await dir.post({ type: 'UPSERT', entry: fixtureEntry() });
    const before = dir.connect().last();

    const res = await dir.post({
      type: 'UPSERT',
      entry: fixtureEntry({ code: 'CCCCCC' }),
      round: 3,
    });

    expect(res.status).toBe(400);
    expect(dir.connect().last()).toEqual(before);
  });

  it('rejects an UPSERT whose hostCodename exceeds 20 characters with 400 and leaves state unchanged', async () => {
    const dir = createTestDirectory();
    await dir.post({ type: 'UPSERT', entry: fixtureEntry() });
    const before = dir.connect().last();

    const res = await dir.post({
      type: 'UPSERT',
      entry: fixtureEntry({ code: 'CCCCCC', hostCodename: 'A'.repeat(21) }),
    });

    expect(res.status).toBe(400);
    expect(dir.connect().last()).toEqual(before);
  });

  it('rejects an UPSERT whose seatsTotal is out of range (5 or 0) with 400 and leaves state unchanged', async () => {
    const dir = createTestDirectory();
    await dir.post({ type: 'UPSERT', entry: fixtureEntry() });
    const before = dir.connect().last();

    const resFive = await dir.post({
      type: 'UPSERT',
      entry: fixtureEntry({ code: 'CCCCCC', seatsTotal: 5 }),
    });
    expect(resFive.status).toBe(400);
    expect(dir.connect().last()).toEqual(before);

    const resZero = await dir.post({
      type: 'UPSERT',
      entry: fixtureEntry({ code: 'DDDDDD', seatsTotal: 0 }),
    });
    expect(resZero.status).toBe(400);
    expect(dir.connect().last()).toEqual(before);
  });

  it('rejects a non-POST request with 405', async () => {
    const dir = createTestDirectory();
    const res = await dir.post({}, 'GET');
    expect(res.status).toBe(405);
  });
});

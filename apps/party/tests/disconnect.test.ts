import { DEFAULT_LOBBY_SETTINGS } from '@berlin/shared';
import type { ServerMessage } from '@berlin/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDisconnectGrace, expiredGraceSeats, scheduleDisconnectGrace } from '../src/timers.js';
import { DISCONNECT_GRACE_MS, emptySeats, type RoomState } from '../src/state.js';
import { createTestRoom } from './helpers.js';

function last<T extends ServerMessage['type']>(
  messages: readonly ServerMessage[],
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.type === type) return message as Extract<ServerMessage, { type: T }>;
  }
  return undefined;
}

/** A LOBBY RoomState fixture: the first `humanCount` seats are HUMAN
 *  (controlledBy 'HUMAN'), the rest OPEN. Mirrors botfill.test.ts's own
 *  fixtureRoom. */
function fixtureRoom(humanCount: number, matchId = 'ABCDEF'): RoomState {
  const seats = emptySeats().map((seat, i) =>
    i < humanCount
      ? {
          ...seat,
          playerId: `p${i}`,
          codename: `Seat ${i}`,
          kind: 'HUMAN' as const,
          controlledBy: 'HUMAN' as const,
        }
      : seat,
  );
  return {
    code: matchId,
    matchId,
    phase: 'LOBBY',
    hostPlayerId: seats[0]?.playerId ?? '',
    seats,
    startsAt: null,
    gameState: null,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
    chat: { LOBBY: [], MATCH: [] },
    settings: DEFAULT_LOBBY_SETTINGS,
    disconnectedSeats: [],
  };
}

describe('apps/party/src/timers.ts disconnect-grace scheduling', () => {
  it('scheduleDisconnectGrace adds one DisconnectedSeat carrying seatIndex/playerId/graceExpiresAt = now + durationMs; a second call for the same seat is a no-op by reference', () => {
    const state = fixtureRoom(1);
    const now = 1_000_000;
    const withGrace = scheduleDisconnectGrace(state, 0, now, DISCONNECT_GRACE_MS);
    expect(withGrace.disconnectedSeats).toEqual([
      { seatIndex: 0, playerId: 'p0', graceExpiresAt: now + DISCONNECT_GRACE_MS },
    ]);

    const again = scheduleDisconnectGrace(withGrace, 0, now + 5_000, DISCONNECT_GRACE_MS);
    expect(again).toBe(withGrace);
  });

  it('scheduleDisconnectGrace is a no-op for a seat with no playerId, or an OPEN seat', () => {
    const state = fixtureRoom(0); // every seat OPEN
    const result = scheduleDisconnectGrace(state, 0, 1_000, DISCONNECT_GRACE_MS);
    expect(result).toBe(state);
  });

  it('clearDisconnectGrace removes only the entry for that seat index and leaves other entries untouched', () => {
    const state = fixtureRoom(2);
    const withBoth = scheduleDisconnectGrace(
      scheduleDisconnectGrace(state, 0, 1_000, DISCONNECT_GRACE_MS),
      1,
      1_000,
      DISCONNECT_GRACE_MS,
    );
    const cleared = clearDisconnectGrace(withBoth, 0);
    expect(cleared.disconnectedSeats.map((d) => d.seatIndex)).toEqual([1]);

    // A no-op — by reference — when no entry exists for that seat.
    expect(clearDisconnectGrace(cleared, 0)).toBe(cleared);
  });

  it('expiredGraceSeats returns only entries at or before now, and an empty array when none have expired', () => {
    const state = fixtureRoom(2);
    const withBoth = scheduleDisconnectGrace(
      scheduleDisconnectGrace(state, 0, 1_000, 5_000), // expires at 6000
      1,
      1_000,
      20_000, // expires at 21000
    );
    expect(expiredGraceSeats(withBoth, 6_000).map((d) => d.seatIndex)).toEqual([0]);
    expect(expiredGraceSeats(withBoth, 500)).toEqual([]);
  });
});

describe('apps/party/src/room.ts onClose (D-07 disconnect grace)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('onClose for a bound connection schedules a grace entry and clears that seats connectionId; onClose for an unbound connection changes nothing', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const before = room.roomState();

    const stray = room.connect(); // never sent CREATE/JOIN — no seat binding
    await stray.close();
    expect(room.roomState()).toBe(before); // unchanged, by reference — no persist ran

    await host.close();
    const after = room.roomState()!;
    expect(after).not.toBe(before);
    expect(after.disconnectedSeats).toHaveLength(1);
    expect(after.disconnectedSeats[0]!.seatIndex).toBe(0);
    expect(after.seats.find((s) => s.index === 0)?.connectionId).toBeNull();
  });

  it('toSnapshot sets disconnected true for a seat with a live grace entry, false otherwise', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    let snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.seats[0]!.disconnected).toBe(false);

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    await guest.close();

    snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.seats.find((s) => s.codename === 'Katja')?.disconnected).toBe(true);
    expect(snapshot.seats.find((s) => s.codename === 'Vogel')?.disconnected).toBe(false);
  });

  it('a JOIN carrying the seats token while a grace entry exists clears the grace entry, rebinds the connection, and leaves controlledBy HUMAN — no takeover ever occurred', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const { token, code } = last(host.received, 'JOINED')!;

    await host.close();
    expect(room.roomState()!.disconnectedSeats).toHaveLength(1);

    const rejoined = room.connect('Vogel');
    await rejoined.send({ type: 'JOIN', code, codename: 'Vogel', token });

    const state = room.roomState()!;
    expect(state.disconnectedSeats).toEqual([]);
    const seat = state.seats.find((s) => s.index === 0)!;
    expect(seat.controlledBy).toBe('HUMAN');
    expect(seat.connectionId).toBe(rejoined.id);
  });

  it('scheduling a grace entry during a live round leaves deadlineAt and deadlineRound strictly unchanged (P-3-03)', async () => {
    vi.useFakeTimers();
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // countdown expiry -> startMatch, IN_GAME

    const before = room.roomState()!;
    expect(before.phase).toBe('IN_GAME');
    const deadlineBefore = before.deadlineAt;
    const roundBefore = before.deadlineRound;

    await host.close();

    const after = room.roomState()!;
    expect(after.deadlineAt).toBe(deadlineBefore);
    expect(after.deadlineRound).toBe(roundBefore);
  });
});

describe('apps/party/src/room.ts alarmTarget (Task 2 — every phase)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when there is no candidate for the current phase', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    expect(await room.alarmScheduled()).toBe(false);
    expect(await room.alarmAt()).toBeNull();
  });

  it('during LOBBY, with both a startsAt and a nearer graceExpiresAt, the scheduled alarm equals the graceExpiresAt', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    await guest.close(); // grace scheduled at t0, expires t0 + 20_000

    vi.setSystemTime(t0 + 15_000);
    await host.send({ type: 'SET_READY', ready: true }); // 1/2 ready -> startsAt = t0 + 25_000

    const state = room.roomState()!;
    expect(state.startsAt).toBe(t0 + 25_000);
    expect(state.disconnectedSeats[0]!.graceExpiresAt).toBe(t0 + 20_000);
    expect(await room.alarmAt()).toBe(t0 + 20_000);
  });

  it('during IN_GAME, the scheduled alarm equals the minimum of deadlineAt, every bot releaseAt, and every graceExpiresAt', async () => {
    vi.useFakeTimers();
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // -> IN_GAME, deadlineAt + bot submissions scheduled

    await host.close(); // schedules a grace entry too

    const state = room.roomState()!;
    expect(state.phase).toBe('IN_GAME');
    const candidates = [
      state.deadlineAt!,
      ...state.botSubmissions.map((s) => s.releaseAt),
      ...state.disconnectedSeats.map((d) => d.graceExpiresAt),
    ];
    expect(await room.alarmAt()).toBe(Math.min(...candidates));
  });
});

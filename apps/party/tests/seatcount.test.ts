import { clientMessageSchema, type ServerMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { handleSetSeatCount } from '../src/handlers.js';
import {
  canSetSeatCount,
  emptySeats,
  minSeatCount,
  setSeatCount,
  type RoomState,
} from '../src/state.js';
import { bindConnection } from '../src/auth.js';
import { createTestRoom } from './helpers.js';

/** A LOBBY RoomState fixture — `occupiedIndexes` are marked HUMAN, all
 *  other seats stay OPEN. Mirrors lobby.test.ts's fixtureState idiom. */
function fixtureState(occupiedIndexes: number[], overrides: Partial<RoomState> = {}): RoomState {
  const seats = emptySeats().map((seat) =>
    occupiedIndexes.includes(seat.index)
      ? { ...seat, playerId: `p${seat.index}`, codename: `Seat ${seat.index}`, kind: 'HUMAN' as const }
      : seat,
  );
  return {
    code: 'ABCDEF',
    matchId: 'ABCDEF',
    phase: 'LOBBY',
    hostPlayerId: `p${occupiedIndexes[0] ?? 0}`,
    seats,
    startsAt: null,
    gameState: null,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
    chat: { LOBBY: [], MATCH: [] },
    ...overrides,
  };
}

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

describe('apps/party/src/state.ts canSetSeatCount / minSeatCount / setSeatCount (pure)', () => {
  it('canSetSeatCount is true for 1..4 at or above minSeatCount, false for 0, 5, 3.5, NaN', () => {
    const state = fixtureState([0]);
    expect(canSetSeatCount(state, 1)).toBe(true);
    expect(canSetSeatCount(state, 2)).toBe(true);
    expect(canSetSeatCount(state, 3)).toBe(true);
    expect(canSetSeatCount(state, 4)).toBe(true);
    expect(canSetSeatCount(state, 0)).toBe(false);
    expect(canSetSeatCount(state, 5)).toBe(false);
    expect(canSetSeatCount(state, 3.5)).toBe(false);
    expect(canSetSeatCount(state, Number.NaN)).toBe(false);
  });

  it('minSeatCount of a lobby whose only occupied seat is index 0 is 1', () => {
    expect(minSeatCount(fixtureState([0]))).toBe(1);
  });

  it('minSeatCount of a lobby with seats 0 and 2 occupied (seat 1 open) is 3 — the highest occupied index plus one', () => {
    const state = fixtureState([0, 2]);
    expect(minSeatCount(state)).toBe(3);
    expect(canSetSeatCount(state, 2)).toBe(false);
  });

  it('setSeatCount(state, 2) on a 4-seat lobby with only seat 0 occupied returns length 2, preserving seat 0', () => {
    const state = fixtureState([0]);
    const next = setSeatCount(state, 2, Date.now());
    expect(next.seats).toHaveLength(2);
    const seat0 = next.seats.find((s) => s.index === 0);
    expect(seat0?.playerId).toBe('p0');
    expect(seat0?.codename).toBe('Seat 0');
    expect(seat0?.token).toBe(state.seats[0]?.token);
    expect(seat0?.faction).toBe(state.seats[0]?.faction);
  });

  it('setSeatCount(state, 4) on a 2-seat lobby appends two OPEN seats whose faction matches SECTORS at that index', () => {
    const state = fixtureState([0], {});
    const shrunk = setSeatCount(state, 2, Date.now());
    const grown = setSeatCount(shrunk, 4, Date.now());
    expect(grown.seats).toHaveLength(4);
    const seat2 = grown.seats.find((s) => s.index === 2);
    const seat3 = grown.seats.find((s) => s.index === 3);
    expect(seat2?.kind).toBe('OPEN');
    expect(seat3?.kind).toBe('OPEN');
    expect(seat2?.faction).toBe(state.seats[2]?.faction);
    expect(seat3?.faction).toBe(state.seats[3]?.faction);
  });

  it('setSeatCount(state, n) called twice with the same n returns the identical object reference on the second call', () => {
    const state = fixtureState([0]);
    const once = setSeatCount(state, 2, Date.now());
    const twice = setSeatCount(once, 2, Date.now());
    expect(twice).toBe(once);
  });

  it('setSeatCount rejects while phase is IN_GAME or ENDED, returning state unchanged', () => {
    const inGame = fixtureState([0], { phase: 'IN_GAME' });
    expect(setSeatCount(inGame, 2, Date.now())).toBe(inGame);
    const ended = fixtureState([0], { phase: 'ENDED' });
    expect(setSeatCount(ended, 2, Date.now())).toBe(ended);
  });
});

describe('apps/party/src/handlers.ts handleSetSeatCount (pure)', () => {
  it('from a non-host connection returns state unchanged and a SET_SEAT_COUNT_REJECTED reply', () => {
    const state = fixtureState([0, 1]);
    const guestConn = 'guest-conn';
    const bound = bindConnection(state, guestConn, 1);
    const result = handleSetSeatCount(bound, 2, guestConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('SET_SEAT_COUNT_REJECTED');
  });

  it('from an unbound connection returns state unchanged and a null reply', () => {
    const state = fixtureState([0]);
    const result = handleSetSeatCount(state, 2, 'no-such-connection', Date.now());
    expect(result.state).toBe(state);
    expect(result.toSender).toBeNull();
  });

  it('seats 0 and 2 occupied, seat 1 open: handleSetSeatCount(state, 2, hostConn, now) returns SET_SEAT_COUNT_REJECTED with state unchanged', () => {
    const state = fixtureState([0, 2]);
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);
    const result = handleSetSeatCount(bound, 2, hostConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('SET_SEAT_COUNT_REJECTED');
  });
});

describe('apps/party clientMessageSchema SET_SEAT_COUNT bounds', () => {
  it('rejects count 5, 0, and 2.5', () => {
    expect(clientMessageSchema.safeParse({ type: 'SET_SEAT_COUNT', count: 5 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'SET_SEAT_COUNT', count: 0 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'SET_SEAT_COUNT', count: 2.5 }).success).toBe(false);
  });

  it('accepts count 1..4', () => {
    for (const count of [1, 2, 3, 4]) {
      expect(clientMessageSchema.safeParse({ type: 'SET_SEAT_COUNT', count }).success).toBe(true);
    }
  });
});

describe('apps/party integration: SET_SEAT_COUNT over a real room', () => {
  it('a one-seat lobby reaches IN_GAME through the alarm path with a non-null gameState', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_SEAT_COUNT', count: 1 });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    expect(room.roomState()?.phase).toBe('IN_GAME');
    expect(room.roomState()?.gameState).not.toBeNull();
  });

  it("handleJoin's ROOM_FULL message interpolates the current seat count rather than a hardcoded word", async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;
    await host.send({ type: 'SET_SEAT_COUNT', count: 1 });

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    const error = last(guest.received, 'ERROR');
    expect(error?.code).toBe('ROOM_FULL');
    expect(error?.message).toContain('1 player');
    expect(error?.message).not.toMatch(/\bfour\b/i);
  });

  it('a repeated identical SET_SEAT_COUNT value is a no-op that fires no duplicate ROOM_STATE frame', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const beforeCount = host.received.length;
    await host.send({ type: 'SET_SEAT_COUNT', count: 4 }); // already 4 — a genuine no-op
    expect(host.received.length).toBe(beforeCount);
  });
});

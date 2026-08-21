import type { ClientMessage, ServerMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import {
  countdownShouldRun,
  emptySeats,
  readyRatio,
  type RoomState,
} from '../src/state.js';
import { createTestRoom } from './helpers.js';

/** A LOBBY RoomState fixture with `filledCount` seats marked HUMAN (the
 *  first `readyCount` of those also marked ready) and the rest left OPEN —
 *  for exercising readyRatio/countdownShouldRun without a room. */
function fixtureState(filledCount: number, readyCount: number): RoomState {
  const seats = emptySeats().map((seat, i) => {
    if (i >= filledCount) return seat;
    return { ...seat, playerId: `p${i}`, codename: `Seat ${i}`, kind: 'HUMAN' as const, ready: i < readyCount };
  });
  return {
    code: 'ABCDEF',
    matchId: 'ABCDEF',
    phase: 'LOBBY',
    hostPlayerId: seats[0]?.playerId ?? '',
    seats,
    startsAt: null,
    gameState: null,
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

async function createLobby() {
  const room = createTestRoom();
  const host = room.connect('Vogel');
  await host.send({ type: 'CREATE', codename: 'Vogel' });
  const created = last(host.received, 'JOINED');
  if (!created) throw new Error('expected JOINED');
  const code = created.code;

  const guest = room.connect('Katja');
  await guest.send({ type: 'JOIN', code, codename: 'Katja' });

  return { room, host, guest, code };
}

describe('apps/party lobby ready-up (Task 1 tracer)', () => {
  it('a ready toggle from one seat is visible to every connection', async () => {
    const { host, guest } = await createLobby();

    await host.send({ type: 'SET_READY', ready: true });

    const hostSnapshot = last(host.received, 'ROOM_STATE');
    const guestSnapshot = last(guest.received, 'ROOM_STATE');
    expect(hostSnapshot).toBeDefined();
    expect(guestSnapshot).toBeDefined();

    for (const snapshot of [hostSnapshot!.snapshot, guestSnapshot!.snapshot]) {
      const seat0 = snapshot.seats.find((s) => s.index === 0);
      const seat1 = snapshot.seats.find((s) => s.index === 1);
      expect(seat0?.ready).toBe(true);
      expect(seat1?.ready).toBe(false);
    }
  });

  it('two back-to-back SET_READY frames from different connections do not clobber each other', async () => {
    const { host, guest } = await createLobby();

    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    const seat0 = snapshot.seats.find((s) => s.index === 0);
    const seat1 = snapshot.seats.find((s) => s.index === 1);
    expect(seat0?.ready).toBe(true);
    expect(seat1?.ready).toBe(true);
  });

  it('seat array order is stable across a ready toggle', async () => {
    const { host } = await createLobby();
    const before = last(host.received, 'ROOM_STATE')!.snapshot.seats.map((s) => s.playerId);

    await host.send({ type: 'SET_READY', ready: true });

    const after = last(host.received, 'ROOM_STATE')!.snapshot.seats.map((s) => s.playerId);
    expect(after).toEqual(before);
  });

  it("a SET_READY frame carrying an unhonoured identity field toggles only the sending connection's own seat", async () => {
    const { host } = await createLobby();

    // The wire schema carries no identity field. Zod strips unknown
    // properties, so a hostile client cannot use one to target another
    // seat — proven here by casting past the type system to send one
    // anyway and asserting it has no effect.
    const spoofed = {
      type: 'SET_READY',
      ready: true,
      playerId: 'someone-elses-seat',
    } as unknown as ClientMessage;
    await host.send(spoofed);

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    const seat0 = snapshot.seats.find((s) => s.index === 0);
    const seat1 = snapshot.seats.find((s) => s.index === 1);
    expect(seat0?.ready).toBe(true);
    expect(seat1?.ready).toBe(false);
  });
});

describe('apps/party lobby readyRatio / countdownShouldRun (Task 2, pure)', () => {
  it('4 seats, 2 filled, 0 ready: ratio 0, no countdown', () => {
    const state = fixtureState(2, 0);
    expect(readyRatio(state)).toBe(0);
    expect(countdownShouldRun(state)).toBe(false);
  });

  it('2 filled, 1 ready: ratio is exactly 0.5 — the threshold is inclusive', () => {
    const state = fixtureState(2, 1);
    expect(readyRatio(state)).toBe(0.5);
    expect(countdownShouldRun(state)).toBe(true);
  });

  it('3 filled, 1 ready: ratio 1/3, no countdown', () => {
    const state = fixtureState(3, 1);
    expect(readyRatio(state)).toBeCloseTo(1 / 3);
    expect(countdownShouldRun(state)).toBe(false);
  });

  it('3 filled, 2 ready: ratio 2/3, countdown runs', () => {
    const state = fixtureState(3, 2);
    expect(readyRatio(state)).toBeCloseTo(2 / 3);
    expect(countdownShouldRun(state)).toBe(true);
  });

  it('1 filled seat (solo host), 1 ready: ratio 1, countdown runs', () => {
    const state = fixtureState(1, 1);
    expect(readyRatio(state)).toBe(1);
    expect(countdownShouldRun(state)).toBe(true);
  });

  it('0 filled seats: readyRatio is 0, not NaN, and no countdown', () => {
    const state = fixtureState(0, 0);
    expect(readyRatio(state)).toBe(0);
    expect(Number.isNaN(readyRatio(state))).toBe(false);
    expect(countdownShouldRun(state)).toBe(false);
  });

  it('open seats are excluded from both numerator and denominator', () => {
    // 4 seats total (SEAT_COUNT), only 1 filled and ready — the 3 open
    // seats must not count against the ratio.
    const state = fixtureState(1, 1);
    expect(state.seats).toHaveLength(4);
    expect(readyRatio(state)).toBe(1);
  });
});

describe('apps/party lobby countdown lifecycle (Task 2, integration)', () => {
  it('a ready player un-readying below the threshold clears startsAt', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    // 2 filled, 1 ready => exactly 50%: countdown starts.
    await host.send({ type: 'SET_READY', ready: true });
    expect(last(host.received, 'ROOM_STATE')!.snapshot.startsAt).not.toBeNull();

    // Un-ready drops the ratio to 0/2: countdown cancels.
    await host.send({ type: 'SET_READY', ready: false });
    expect(last(host.received, 'ROOM_STATE')!.snapshot.startsAt).toBeNull();
  });

  it('a new player joining an already-counting-down lobby recomputes the threshold and can cancel it', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    // Solo host readies: 1/1 filled, ratio 1 — countdown starts.
    await host.send({ type: 'SET_READY', ready: true });
    expect(last(host.received, 'ROOM_STATE')!.snapshot.startsAt).not.toBeNull();

    // Two more not-ready joins drop the ratio to 1/3: countdown cancels.
    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    const guest2 = room.connect('Marek');
    await guest2.send({ type: 'JOIN', code, codename: 'Marek' });

    expect(last(host.received, 'ROOM_STATE')!.snapshot.startsAt).toBeNull();
  });

  it('setCodename on a ready seat is rejected and leaves the codename unchanged', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    await host.send({ type: 'SET_READY', ready: true });
    await host.send({ type: 'SET_CODENAME', codename: 'Renamed' });

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.seats.find((s) => s.index === 0)?.codename).toBe('Vogel');
  });
});

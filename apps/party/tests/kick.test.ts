import { DEFAULT_LOBBY_SETTINGS } from '@berlin/shared';
import { clientMessageSchema } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { handleKick } from '../src/handlers.js';
import { emptySeats, vacateSeat, type RoomState } from '../src/state.js';
import { bindConnection } from '../src/auth.js';
import { createTestRoom } from './helpers.js';

/** A LOBBY RoomState fixture — `occupiedIndexes` are marked HUMAN, all
 *  other seats stay OPEN. Mirrors seatcount.test.ts's fixtureState idiom. */
function fixtureState(occupiedIndexes: number[], overrides: Partial<RoomState> = {}): RoomState {
  const seats = emptySeats().map((seat) =>
    occupiedIndexes.includes(seat.index)
      ? {
          ...seat,
          playerId: `p${seat.index}`,
          codename: `Seat ${seat.index}`,
          kind: 'HUMAN' as const,
          token: `token${seat.index}`,
          connectionId: `conn${seat.index}`,
        }
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
    settings: DEFAULT_LOBBY_SETTINGS,
    disconnectedSeats: [],
    ...overrides,
  };
}

describe('apps/party/src/state.ts vacateSeat (pure)', () => {
  it('resets the seat to OPEN with playerId/codename/token/connectionId null, preserving index and faction', () => {
    const state = fixtureState([0, 1]);
    const before = state.seats.find((s) => s.index === 1)!;
    const next = vacateSeat(state, 1);
    const after = next.seats.find((s) => s.index === 1)!;

    expect(after.kind).toBe('OPEN');
    expect(after.playerId).toBeNull();
    expect(after.codename).toBeNull();
    expect(after.token).toBeNull();
    expect(after.connectionId).toBeNull();
    expect(after.index).toBe(before.index);
    expect(after.faction).toBe(before.faction);
  });
});

describe('apps/party/src/handlers.ts handleKick (pure)', () => {
  it('from the host for an occupied non-host seat vacates the seat and returns its former connectionId', () => {
    const state = fixtureState([0, 1]);
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);
    const targetConn = bound.seats.find((s) => s.index === 1)!.connectionId!;

    const result = handleKick(bound, 1, hostConn, Date.now());

    expect(result.state).not.toBe(bound);
    const seat1 = result.state!.seats.find((s) => s.index === 1)!;
    expect(seat1.playerId).toBeNull();
    expect(seat1.codename).toBeNull();
    expect(seat1.token).toBeNull();
    expect(seat1.connectionId).toBeNull();
    expect(seat1.kind).toBe('OPEN');
    expect(result.kickedConnectionId).toBe(targetConn);
    expect(result.toSender).toBeNull();
  });

  it('from a non-host connection returns state unchanged and a rejection reply', () => {
    const state = fixtureState([0, 1]);
    const guestConn = 'guest-conn';
    const bound = bindConnection(state, guestConn, 1);
    const result = handleKick(bound, 0, guestConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('ERROR');
    expect(result.kickedConnectionId).toBeNull();
  });

  it("targeting the host's own seat index returns state unchanged and a rejection reply", () => {
    const state = fixtureState([0, 1]);
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);
    const result = handleKick(bound, 0, hostConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('ERROR');
    expect(result.kickedConnectionId).toBeNull();
  });

  it('targeting an OPEN seat returns state unchanged and a rejection reply', () => {
    const state = fixtureState([0]);
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);
    const result = handleKick(bound, 1, hostConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('ERROR');
    expect(result.kickedConnectionId).toBeNull();
  });

  it('targeting an index outside 0..seats.length-1 returns state unchanged and a rejection reply', () => {
    const state = fixtureState([0, 1]);
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);
    const result = handleKick(bound, 99, hostConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('ERROR');
    expect(result.kickedConnectionId).toBeNull();
  });

  it('during IN_GAME returns the state reference unchanged', () => {
    const state = fixtureState([0, 1], { phase: 'IN_GAME' });
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);
    const result = handleKick(bound, 1, hostConn, Date.now());
    expect(result.state).toBe(bound);
    expect(result.toSender?.type).toBe('ERROR');
    expect(result.kickedConnectionId).toBeNull();
  });

  it('from an unbound connection returns state unchanged and a null reply', () => {
    const state = fixtureState([0, 1]);
    const result = handleKick(state, 1, 'no-such-connection', Date.now());
    expect(result.state).toBe(state);
    expect(result.toSender).toBeNull();
  });

  it("kicking a seat with a live disconnect-grace entry clears that entry — a kick mid-reconnect-window must not leave a stale grace entry pointing at a now-OPEN seat (code review CR-01)", () => {
    const state = fixtureState([0, 1], {
      disconnectedSeats: [{ seatIndex: 1, playerId: 'p1', graceExpiresAt: Date.now() + 20_000 }],
    });
    const hostConn = 'host-conn';
    const bound = bindConnection(state, hostConn, 0);

    const result = handleKick(bound, 1, hostConn, Date.now());

    expect(result.state!.disconnectedSeats).toEqual([]);
    const seat1 = result.state!.seats.find((s) => s.index === 1)!;
    expect(seat1.kind).toBe('OPEN');
  });
});

describe('apps/party clientMessageSchema KICK bounds', () => {
  it('rejects seatIndex -1 and 4', () => {
    expect(clientMessageSchema.safeParse({ type: 'KICK', seatIndex: -1 }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'KICK', seatIndex: 4 }).success).toBe(false);
  });

  it('accepts seatIndex 0..3', () => {
    for (const seatIndex of [0, 1, 2, 3]) {
      expect(clientMessageSchema.safeParse({ type: 'KICK', seatIndex }).success).toBe(true);
    }
  });
});

describe('apps/party integration: KICK over a real room', () => {
  it('a host KICK recomputes a stale countdown rather than leaving it at its pre-kick value', async () => {
    // readyRatio's 50%-inclusive threshold (countdownShouldRun) means the
    // countdown only visibly changes on a shouldRun flip — so this drives a
    // 2-seat lobby to exactly the boundary (host not ready, guest ready =
    // 50%, countdown running) and kicks the one ready non-host seat, which
    // drops the ratio to 0% and must clear startsAt rather than leave it
    // pointing at a countdown for a player who is no longer in the room.
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code: room.roomState()!.code, codename: 'Katja' });
    await host.send({ type: 'SET_SEAT_COUNT', count: 2 });
    await guest.send({ type: 'SET_READY', ready: true });

    const startsAtBeforeKick = room.roomState()!.startsAt;
    expect(startsAtBeforeKick).not.toBeNull();

    const guestIndex = room.roomState()!.seats.find((s) => s.codename === 'Katja')!.index;
    await host.send({ type: 'KICK', seatIndex: guestIndex });

    expect(room.roomState()!.startsAt).not.toBe(startsAtBeforeKick);
    expect(room.roomState()!.startsAt).toBeNull();
  });

  it('the kicked connection receives a KICKED message with the removal reason', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code: room.roomState()!.code, codename: 'Katja' });

    const guestIndex = room.roomState()!.seats.find((s) => s.codename === 'Katja')!.index;
    await host.send({ type: 'KICK', seatIndex: guestIndex });

    const kicked = guest.received.find((m) => m.type === 'KICKED');
    expect(kicked).toBeDefined();
    expect((kicked as { reason: string }).reason).toBe(
      'You were removed from the lobby by the host.',
    );
  });

  it('a kicked seat accepts a fresh JOIN for the same code from a new connection — no ban list exists (D-06)', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = room.roomState()!.code;
    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    const guestIndex = room.roomState()!.seats.find((s) => s.codename === 'Katja')!.index;
    await host.send({ type: 'KICK', seatIndex: guestIndex });
    expect(room.roomState()!.seats.find((s) => s.index === guestIndex)!.kind).toBe('OPEN');

    const rejoined = room.connect('Katja Returns');
    await rejoined.send({ type: 'JOIN', code, codename: 'Katja Returns' });

    const joined = rejoined.received.find((m) => m.type === 'JOINED');
    expect(joined).toBeDefined();
    expect(room.roomState()!.seats.find((s) => s.index === guestIndex)!.kind).toBe('HUMAN');
  });
});

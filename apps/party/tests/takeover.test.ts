import { seedRng } from '@berlin/engine';
import type { AgentId, PersonalityId, ServerMessage } from '@berlin/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOT_DIFFICULTY, reclaimSeat, releaseBotSubmissions, takeOverSeat } from '../src/bots.js';
import { emptySeats, type RoomState } from '../src/state.js';
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

/** A 2-seat IN_GAME RoomState fixture: seat 0 is a HUMAN with a token,
 *  seat 1 OPEN. gameState is deliberately null — the pure takeOverSeat/
 *  reclaimSeat tests below don't need a real engine match, only the seat
 *  bookkeeping these two functions own. */
function fixtureRoom(overrides: Partial<RoomState> = {}): RoomState {
  const seats = emptySeats(2).map((seat, i) =>
    i === 0
      ? {
          ...seat,
          playerId: 'p0',
          codename: 'Vogel',
          kind: 'HUMAN' as const,
          controlledBy: 'HUMAN' as const,
          token: 'tok-p0',
        }
      : seat,
  );
  return {
    code: 'ABCDEF',
    matchId: 'ABCDEF',
    phase: 'IN_GAME',
    hostPlayerId: 'p0',
    seats,
    startsAt: null,
    gameState: null,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
    chat: { LOBBY: [], MATCH: [] },
    disconnectedSeats: [],
    ...overrides,
  };
}

describe('apps/party/src/bots.ts takeOverSeat (pure)', () => {
  it("preserves the seat's playerId, token, codename and kind exactly, sets controlledBy to AI, and assigns a non-null personality and BOT_DIFFICULTY", () => {
    const state = fixtureRoom();
    const before = state.seats[0]!;
    const after = takeOverSeat(state, 0, seedRng('takeover-a'));
    const seat = after.seats[0]!;
    expect(seat.playerId).toBe(before.playerId);
    expect(seat.token).toBe(before.token);
    expect(seat.codename).toBe(before.codename);
    expect(seat.kind).toBe(before.kind);
    expect(seat.controlledBy).toBe('AI');
    expect(seat.personality).not.toBeNull();
    expect(seat.difficulty).toBe(BOT_DIFFICULTY);
  });

  it('returns the state unchanged by reference on an already-AI-controlled seat', () => {
    const state = fixtureRoom();
    const takenOver = takeOverSeat(state, 0, seedRng('takeover-b'));
    const again = takeOverSeat(takenOver, 0, seedRng('takeover-c'));
    expect(again).toBe(takenOver);
  });

  it("clears that seat's grace entry as part of the same transition — a taken-over seat is no longer merely disconnected", () => {
    const state = fixtureRoom({
      disconnectedSeats: [{ seatIndex: 0, playerId: 'p0', graceExpiresAt: 1_000 }],
    });
    const after = takeOverSeat(state, 0, seedRng('takeover-d'));
    expect(after.disconnectedSeats).toEqual([]);
  });

  it('re-taking a previously-reclaimed seat keeps the same bot identity (personality is not re-rolled once already set)', () => {
    const state = fixtureRoom();
    const firstTakeover = takeOverSeat(state, 0, seedRng('takeover-e'));
    const personality = firstTakeover.seats[0]!.personality;
    const reclaimed = reclaimSeat(firstTakeover, 0);
    const secondTakeover = takeOverSeat(reclaimed, 0, seedRng('a-totally-different-seed'));
    expect(secondTakeover.seats[0]!.personality).toBe(personality);
  });
});

describe('apps/party/src/bots.ts reclaimSeat (pure)', () => {
  it('sets controlledBy back to HUMAN and leaves playerId, token, codename and kind untouched', () => {
    const state = fixtureRoom();
    const takenOver = takeOverSeat(state, 0, seedRng('reclaim-a'));
    const reclaimed = reclaimSeat(takenOver, 0);
    const seat = reclaimed.seats[0]!;
    expect(seat.controlledBy).toBe('HUMAN');
    expect(seat.playerId).toBe(state.seats[0]!.playerId);
    expect(seat.token).toBe(state.seats[0]!.token);
    expect(seat.codename).toBe(state.seats[0]!.codename);
    expect(seat.kind).toBe(state.seats[0]!.kind);
  });

  it("removes every botSubmissions entry whose playerId matches the reclaimed seat, in the same returned state, and leaves every other seat's submissions untouched", () => {
    const state = fixtureRoom();
    const takenOver = takeOverSeat(state, 0, seedRng('reclaim-b'));
    const withSubs: RoomState = {
      ...takenOver,
      botSubmissions: [
        { playerId: 'p0', order: { agentId: 'a0' as AgentId, actions: [{ type: 'HOLD' }] }, releaseAt: 5_000 },
        {
          playerId: 'other-bot',
          order: { agentId: 'a1' as AgentId, actions: [{ type: 'HOLD' }] },
          releaseAt: 6_000,
        },
      ],
    };
    const reclaimed = reclaimSeat(withSubs, 0);
    expect(reclaimed.botSubmissions.map((s) => s.playerId)).toEqual(['other-bot']);
  });

  it('reclaimSeat returns exactly one object literal — the control flip, submission purge and grace clear are all in the same returned state', () => {
    const state = fixtureRoom({
      disconnectedSeats: [{ seatIndex: 0, playerId: 'p0', graceExpiresAt: 1_000 }],
      botSubmissions: [
        { playerId: 'p0', order: { agentId: 'a0' as AgentId, actions: [{ type: 'HOLD' }] }, releaseAt: 5_000 },
      ],
    });
    const takenOver = takeOverSeat({ ...state, disconnectedSeats: [] }, 0, seedRng('reclaim-c'));
    const withSubsAndGrace: RoomState = {
      ...takenOver,
      disconnectedSeats: [{ seatIndex: 0, playerId: 'p0', graceExpiresAt: 1_000 }],
      botSubmissions: state.botSubmissions,
    };
    const reclaimed = reclaimSeat(withSubsAndGrace, 0);
    expect(reclaimed.seats[0]!.controlledBy).toBe('HUMAN');
    expect(reclaimed.botSubmissions).toEqual([]);
    expect(reclaimed.disconnectedSeats).toEqual([]);
  });

  it('is a no-op for a seat that is not controlledBy AI', () => {
    const state = fixtureRoom();
    expect(reclaimSeat(state, 0)).toBe(state);
  });
});

describe('apps/party lobby/room integration — takeover on grace expiry (Task 3)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a grace entry expiring during IN_GAME triggers takeOverSeat, and the match continues — the next round closes and resolves normally with that seats orders decided by the bot', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' }); // solo — 3 seats auto-fill with bots at start
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // -> IN_GAME, round 1

    const round1 = room.roomState()!;
    expect(round1.phase).toBe('IN_GAME');
    const hostPlayerId = round1.seats[0]!.playerId!;
    const deadline1 = round1.deadlineAt!;

    await host.close(); // grace scheduled, expires at t0 + 20_000

    vi.setSystemTime(t0 + 20_000);
    await room.triggerAlarm(); // grace expiry -> takeover fires; round 1 not yet due

    const takenOver = room.roomState()!;
    const seat0 = takenOver.seats.find((s) => s.playerId === hostPlayerId)!;
    expect(seat0.controlledBy).toBe('AI');
    expect(seat0.personality).not.toBeNull();
    expect(takenOver.phase).toBe('IN_GAME'); // round 1 kept running, unaffected

    vi.setSystemTime(deadline1); // round 1's real deadline
    await room.triggerAlarm(); // round 1 auto-Holds seat0 (now AI, never submitted) and closes; round 2 begins

    const round2 = room.roomState()!;
    expect(round2.phase).toBe('IN_GAME');
    expect(round2.gameState!.round).toBe(round1.gameState!.round + 1);
    // The reclaimed-to-be seat's orders ARE decided by the bot for the new
    // round — decideForBotSeats' controlledBy filter (Task 1) picking it up
    // exactly like an original lobby-fill bot seat.
    expect(round2.botSubmissions.some((s) => s.playerId === hostPlayerId)).toBe(true);

    // And the match keeps advancing normally: release every queued
    // submission and let round 2 close too.
    const maxReleaseAt = Math.max(...round2.botSubmissions.map((s) => s.releaseAt));
    vi.setSystemTime(maxReleaseAt + 1);
    await room.triggerAlarm();
    const round3 = room.roomState()!;
    expect(round3.phase).toBe('IN_GAME');
    expect(round3.gameState!.round).toBe(round2.gameState!.round + 1);
  });

  it('a grace entry expiring during LOBBY triggers a takeover and the seats readout flips to its personality; the lobby is still startable', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_SEAT_COUNT', count: 2 });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    const guestPlayerId = last(guest.received, 'JOINED')!.playerId;

    await guest.close(); // grace scheduled at t0, expires t0 + 20_000 — no one has readied, startsAt is null

    vi.setSystemTime(t0 + 20_000);
    await room.triggerAlarm(); // grace expiry during LOBBY, no countdown due

    const afterTakeover = room.roomState()!;
    expect(afterTakeover.phase).toBe('LOBBY'); // T-03-23: not mistaken for a countdown expiry
    const guestSeat = afterTakeover.seats.find((s) => s.playerId === guestPlayerId)!;
    expect(guestSeat.controlledBy).toBe('AI');
    expect(guestSeat.personality).not.toBeNull();

    // The lobby is still startable: the host readies up, which alone
    // crosses the 50% threshold (host ready, guest's seat still counted as
    // filled), and the alarm carries the match into IN_GAME.
    await host.send({ type: 'SET_READY', ready: true });
    expect(room.roomState()!.startsAt).not.toBeNull();

    vi.setSystemTime(room.roomState()!.startsAt!);
    await room.triggerAlarm();

    const started = room.roomState()!;
    expect(started.phase).toBe('IN_GAME');
    expect(started.gameState).not.toBeNull();
  });

  it('the overwrite-race regression: a reclaimed seats own fresh order survives a stale, already-purged bot submissions release attempt', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_SEAT_COUNT', count: 2 }); // host + exactly 1 bot seat
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // -> IN_GAME, round 1 (host + 1 bot seat, no bot submissions yet for host)

    const round1 = room.roomState()!;
    const hostPlayerId = round1.seats[0]!.playerId!;
    const deadline1 = round1.deadlineAt!;

    await host.close(); // grace starts at t0

    vi.setSystemTime(t0 + 20_000);
    await room.triggerAlarm(); // takeover fires for host's seat

    vi.setSystemTime(deadline1);
    await room.triggerAlarm(); // round 1 closes (auto-Hold for host/AI); round 2 begins, bots decided —
    // including a fresh submission for the now-AI host seat.

    const stateAtRound2 = room.roomState()!;
    expect(stateAtRound2.gameState!.round).toBe(round1.gameState!.round + 1);
    const capturedStale = stateAtRound2.botSubmissions.find((s) => s.playerId === hostPlayerId);
    expect(capturedStale).toBeDefined(); // a stale bot order IS queued for the reclaimed-to-be seat
    const staleActions = capturedStale!.order.actions;

    // Reconnect with the original token — reclaimSeat runs as part of the
    // same JOIN, atomically purging capturedStale from botSubmissions.
    const { token, code } = last(host.received, 'JOINED')!;
    const rejoined = room.connect('Vogel');
    await rejoined.send({ type: 'JOIN', code, codename: 'Vogel', token });

    const afterReclaim = room.roomState()!;
    expect(afterReclaim.seats.find((s) => s.playerId === hostPlayerId)!.controlledBy).toBe('HUMAN');
    expect(afterReclaim.botSubmissions.some((s) => s.playerId === hostPlayerId)).toBe(false);

    // Submit a real order, deliberately distinguishable from whatever the
    // stale (now-purged) bot order chose.
    const agentId = afterReclaim.gameState!.players[hostPlayerId]!.agents[0]!.id;
    const humanActions =
      staleActions[0]?.type === 'HOLD'
        ? ([{ type: 'HOLD' }, { type: 'HOLD' }] as const)
        : ([{ type: 'HOLD' }] as const);
    await rejoined.send({
      type: 'SUBMIT_ORDER',
      round: afterReclaim.gameState!.round,
      agentId,
      actions: [...humanActions],
    });

    const afterHumanSubmit = room.roomState()!;
    expect(afterHumanSubmit.gameState!.pendingOrders[agentId as unknown as string]).toEqual({
      agentId,
      actions: [...humanActions],
    });

    // Advance past the stale entry's own original releaseAt and release
    // every remaining (legitimate) queued submission through the exact
    // function room.ts's onAlarm calls — proving the purged entry cannot
    // resurrect itself and overwrite the human's fresh order no matter how
    // far the clock moves.
    const farFuture = capturedStale!.releaseAt + 10_000;
    const { state: releasedState } = releaseBotSubmissions(afterHumanSubmit, farFuture);
    expect(releasedState.gameState!.pendingOrders[agentId as unknown as string]).toEqual({
      agentId,
      actions: [...humanActions],
    });
  });

  it('a reclaim during IN_GAME sends the reclaiming connection a VIEW built from projectView for that seat, and no frame carrying bot belief or threat-map data', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);

    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // -> IN_GAME

    const round1 = room.roomState()!;
    const hostPlayerId = round1.seats[0]!.playerId!;
    const { token, code } = last(host.received, 'JOINED')!;

    await host.close();
    vi.setSystemTime(t0 + 20_000);
    await room.triggerAlarm(); // takeover fires

    const rejoined = room.connect('Vogel');
    await rejoined.send({ type: 'JOIN', code, codename: 'Vogel', token });

    const view = last(rejoined.received, 'VIEW');
    expect(view).toBeDefined();
    expect(view!.view.self.id).toBe(hostPlayerId);

    const combined = JSON.stringify(rejoined.received);
    for (const forbidden of ['belief', 'threatMap', 'particles', 'threat']) {
      expect(combined.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

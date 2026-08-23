import { PHANTOM, seedRng } from '@berlin/engine';
import { DIFFICULTY_IDS } from '@berlin/ai';
import type { ServerMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { fillEmptySeatsWithBots, BOT_DIFFICULTY } from '../src/bots.js';
import { buildMatchConfig, startMatch } from '../src/settings.js';
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

/** A LOBBY RoomState fixture: the first `humanCount` seats are HUMAN, the
 *  rest OPEN. */
function fixtureRoom(humanCount: number, matchId = 'ABCDEF'): RoomState {
  const seats = emptySeats().map((seat, i) =>
    i < humanCount
      ? { ...seat, playerId: `p${i}`, codename: `Seat ${i}`, kind: 'HUMAN' as const }
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
  };
}

describe('apps/party/src/bots.ts fillEmptySeatsWithBots', () => {
  it('a 4-seat room with 1 human returns 4 seats: 1 HUMAN, 3 BOT', () => {
    const state = fixtureRoom(1);
    const filled = fillEmptySeatsWithBots(state, seedRng('seed-a'));
    expect(filled.seats.filter((s) => s.kind === 'HUMAN')).toHaveLength(1);
    expect(filled.seats.filter((s) => s.kind === 'BOT')).toHaveLength(3);
  });

  it('a room with 4 humans returns the identical seat array — zero bots added', () => {
    const state = fixtureRoom(4);
    const filled = fillEmptySeatsWithBots(state, seedRng('seed-b'));
    expect(filled.seats).toEqual(state.seats);
  });

  it('bot seats are assigned to empty seat indices in ascending order', () => {
    const state = fixtureRoom(1);
    const filled = fillEmptySeatsWithBots(state, seedRng('seed-c'));
    const botIndices = filled.seats.filter((s) => s.kind === 'BOT').map((s) => s.index);
    expect(botIndices).toEqual([1, 2, 3]);
  });

  it('every bot seat gets difficulty HANDLER, never RECRUIT or SPYMASTER', () => {
    const state = fixtureRoom(1);
    const filled = fillEmptySeatsWithBots(state, seedRng('seed-d'));
    expect(BOT_DIFFICULTY).toBe('HANDLER');
    for (const seat of filled.seats.filter((s) => s.kind === 'BOT')) {
      expect(seat.difficulty).toBe('HANDLER');
    }
    expect(DIFFICULTY_IDS).toContain('HANDLER');
  });

  it('every bot seat gets a personality drawn via the seeded RNG — same seed, same roster', () => {
    const state = fixtureRoom(1);
    const a = fillEmptySeatsWithBots(state, seedRng('same-seed'));
    const b = fillEmptySeatsWithBots(state, seedRng('same-seed'));
    expect(a.seats.map((s) => s.personality)).toEqual(b.seats.map((s) => s.personality));
  });

  it('skips any seat whose playerId is non-null — a late human keeps their seat', () => {
    const state = fixtureRoom(1);
    // Seat 1 joined between the countdown starting and the alarm firing.
    const seats = state.seats.map((s) =>
      s.index === 1 ? { ...s, playerId: 'p1-late', codename: 'Late', kind: 'HUMAN' as const } : s,
    );
    const filled = fillEmptySeatsWithBots({ ...state, seats }, seedRng('seed-e'));
    expect(filled.seats.find((s) => s.index === 1)?.kind).toBe('HUMAN');
    expect(filled.seats.filter((s) => s.kind === 'BOT')).toHaveLength(2);
  });
});

describe('apps/party/src/settings.ts buildMatchConfig / startMatch', () => {
  it('buildMatchConfig locks D-01 through D-04 as literal values', () => {
    const config = buildMatchConfig(fixtureRoom(2));
    expect(config.agentsPerPlayer).toBe(1);
    expect(config.mapId).toBe('duel-12');
    expect(config.roundTimerSeconds).toBe(90);
    expect(config.roundLimit).toBe(14);
    expect(config.teams).toBe(false);
    expect(config.pausesPerPlayer).toBe(0);
  });

  it('buildMatchConfig produces one SeatConfig per room seat with distinct ids and factions', () => {
    const config = buildMatchConfig(fillEmptySeatsWithBots(fixtureRoom(1), seedRng('seed-f')));
    expect(config.seats).toHaveLength(4);
    expect(new Set(config.seats.map((s) => s.id)).size).toBe(4);
    expect(new Set(config.seats.map((s) => s.faction)).size).toBe(4);
  });

  it('startMatch on a room already IN_GAME returns the state unchanged', () => {
    const started = startMatch(fixtureRoom(4), Date.now());
    const again = startMatch(started, Date.now());
    expect(again).toBe(started);
  });

  it('after startMatch, phase is IN_GAME, gameState is non-null, and every loadout is PHANTOM', () => {
    const started = startMatch(fixtureRoom(2), Date.now());
    expect(started.phase).toBe('IN_GAME');
    expect(started.gameState).not.toBeNull();
    for (const player of Object.values(started.gameState!.players)) {
      expect(player.loadout).toEqual([...PHANTOM]);
    }
  });

  it('startMatch is deterministic: two runs from the same room id produce the same bot roster', () => {
    const a = startMatch(fixtureRoom(1, 'SAMEID'), 1_000);
    const b = startMatch(fixtureRoom(1, 'SAMEID'), 2_000);
    const rosterOf = (s: RoomState) => s.seats.filter((seat) => seat.kind === 'BOT').map((seat) => seat.personality);
    expect(rosterOf(a)).toEqual(rosterOf(b));
  });
});

describe('apps/party lobby -> match-start integration (Task 3)', () => {
  it('a solo host starting the countdown lands in IN_GAME with 3 bot seats after the alarm fires', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });

    await room.triggerAlarm();

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.phase).toBe('IN_GAME');
    expect(snapshot.seats.filter((s) => s.kind === 'BOT')).toHaveLength(3);
  });

  it('four humans all ready leaves zero bot seats after the alarm fires', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guests = [];
    for (const codename of ['Katja', 'Marek', 'Halloran']) {
      const guest = room.connect(codename);
      await guest.send({ type: 'JOIN', code, codename });
      guests.push(guest);
    }

    for (const conn of [host, ...guests]) {
      await conn.send({ type: 'SET_READY', ready: true });
    }

    await room.triggerAlarm();

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.phase).toBe('IN_GAME');
    expect(snapshot.seats.filter((s) => s.kind === 'BOT')).toHaveLength(0);
    expect(snapshot.seats.filter((s) => s.kind === 'HUMAN')).toHaveLength(4);
  });

  it('each connection receives its own VIEW frame after startMatch, and no two are byte-identical', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const hostPlayerId = last(host.received, 'JOINED')!.playerId;
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    const guestPlayerId = last(guest.received, 'JOINED')!.playerId;

    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });

    await room.triggerAlarm();

    const hostView = last(host.received, 'VIEW');
    const guestView = last(guest.received, 'VIEW');
    expect(hostView).toBeDefined();
    expect(guestView).toBeDefined();
    // Each connection's VIEW frame carries exactly its own seat's identity —
    // not merely "different from the other one", but "matches my own seat".
    expect(hostView!.view.self.id).toBe(hostPlayerId);
    expect(guestView!.view.self.id).toBe(guestPlayerId);
    expect(hostView!.view.self.id).not.toBe(guestView!.view.self.id);
    expect(JSON.stringify(hostView)).not.toBe(JSON.stringify(guestView));
  });

  it('a human who joins after the countdown starts still has their own seat as HUMAN once the match starts', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;
    await host.send({ type: 'SET_READY', ready: true });

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    await room.triggerAlarm();

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.seats.find((s) => s.playerId && s.codename === 'Katja')?.kind).toBe('HUMAN');
  });
});

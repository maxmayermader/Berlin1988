import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedRng } from '@berlin/engine';
import { chatMessageSchema, clientMessageSchema, CHAT_TEXT_MAX } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { handleChatSend } from '../src/handlers.js';
import { emptySeats, type RoomState } from '../src/state.js';
import { createTestRoom } from './helpers.js';

/** A LOBBY RoomState fixture — mirrors kick.test.ts/seatcount.test.ts's
 *  fixtureState idiom. `occupiedIndexes` are marked HUMAN with a codename,
 *  all other seats stay OPEN. */
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
    ...overrides,
  };
}

function fakeRng() {
  // The engine's real seeded PRNG — apps/party/CLAUDE.md rule 9 bans any
  // other randomness source, including a hand-rolled test stub.
  return seedRng('chat-test-seed');
}

describe('apps/party/src/handlers.ts handleChatSend (pure)', () => {
  it("from a bound seat whose codename is 'Iron Falcon' produces a broadcast whose codename is 'Iron Falcon', regardless of anything in the inbound frame", () => {
    const state = fixtureState([0]);
    const withCodename: RoomState = {
      ...state,
      seats: state.seats.map((s) => (s.index === 0 ? { ...s, codename: 'Iron Falcon' } : s)),
    };
    const result = handleChatSend(
      withCodename,
      { type: 'CHAT_SEND', text: 'hello there' },
      'conn0',
      Date.now(),
      fakeRng(),
    );
    expect(result.broadcast?.codename).toBe('Iron Falcon');
  });

  it('from an unbound connection returns state unchanged, a null broadcast, and a null reply', () => {
    const state = fixtureState([0]);
    const result = handleChatSend(
      state,
      { type: 'CHAT_SEND', text: 'hi' },
      'no-such-connection',
      Date.now(),
      fakeRng(),
    );
    expect(result.state).toBe(state);
    expect(result.broadcast).toBeNull();
    expect(result.toSender).toBeNull();
  });

  it('a whitespace-only text is rejected server-side with CHAT_REJECTED and produces no broadcast', () => {
    const state = fixtureState([0]);
    const result = handleChatSend(state, { type: 'CHAT_SEND', text: ' ' }, 'conn0', Date.now(), fakeRng());
    expect(result.toSender?.type).toBe('CHAT_REJECTED');
    expect(result.broadcast).toBeNull();
  });
});

describe('packages/shared/src/protocol.ts CHAT_SEND / chatMessageSchema (pure)', () => {
  it('parsing a CHAT_SEND frame carrying an extra codename key fails', () => {
    expect(
      clientMessageSchema.safeParse({ type: 'CHAT_SEND', text: 'hi', codename: 'Someone Else' })
        .success,
    ).toBe(false);
  });

  it('a 241-character text fails clientMessageSchema parsing and a 240-character text passes', () => {
    const over = 'a'.repeat(CHAT_TEXT_MAX + 1);
    const atMax = 'a'.repeat(CHAT_TEXT_MAX);
    expect(clientMessageSchema.safeParse({ type: 'CHAT_SEND', text: over }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: 'CHAT_SEND', text: atMax }).success).toBe(true);
  });

  it('a ChatMessage object carrying a sixth key (e.g. seatIndex) fails chatMessageSchema', () => {
    const result = chatMessageSchema.safeParse({
      id: 'x',
      scope: 'LOBBY',
      codename: 'A',
      text: 'hi',
      at: 1,
      seatIndex: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe('apps/party integration: CHAT_SEND over a real room', () => {
  it('every connection in the room receives byte-identical CHAT_MESSAGE payloads for the same send', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = room.roomState()!.code;

    const guest1 = room.connect('Katja');
    await guest1.send({ type: 'JOIN', code, codename: 'Katja' });
    const guest2 = room.connect('Marek');
    await guest2.send({ type: 'JOIN', code, codename: 'Marek' });

    await host.send({ type: 'CHAT_SEND', text: 'Berlin is nice this time of year.' });

    const hostMsg = host.received.filter((m) => m.type === 'CHAT_MESSAGE').at(-1);
    const guest1Msg = guest1.received.filter((m) => m.type === 'CHAT_MESSAGE').at(-1);
    const guest2Msg = guest2.received.filter((m) => m.type === 'CHAT_MESSAGE').at(-1);

    expect(hostMsg).toBeDefined();
    const hostBytes = JSON.stringify(hostMsg);
    expect(JSON.stringify(guest1Msg)).toBe(hostBytes);
    expect(JSON.stringify(guest2Msg)).toBe(hostBytes);
  });

  it('a whitespace-only CHAT_SEND (single space, passes the schema) is answered with CHAT_REJECTED and produces no CHAT_MESSAGE on any connection', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = room.roomState()!.code;
    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    await host.send({ type: 'CHAT_SEND', text: ' ' });

    expect(host.received.some((m) => m.type === 'CHAT_REJECTED')).toBe(true);
    expect(host.received.some((m) => m.type === 'CHAT_MESSAGE')).toBe(false);
    expect(guest.received.some((m) => m.type === 'CHAT_MESSAGE')).toBe(false);
  });

  it('a player types in the lobby, presses Send, and every other connection sees the message attributed to the sender codename', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = room.roomState()!.code;
    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    await host.send({ type: 'CHAT_SEND', text: 'Trust no one — especially the quiet ones.' });

    const received = guest.received.find((m) => m.type === 'CHAT_MESSAGE');
    expect(received).toBeDefined();
    expect((received as { message: { codename: string; text: string } }).message.codename).toBe(
      'Vogel',
    );
    expect((received as { message: { codename: string; text: string } }).message.text).toBe(
      'Trust no one — especially the quiet ones.',
    );
  });
});

describe('apps/party/src/broadcast.ts sendChat shape (static, T-03-14/P-3-02)', () => {
  it('calls getConnections() exactly once, contains no seatFor call, and no conditional inside its send loop', () => {
    const path = fileURLToPath(new URL('../src/broadcast.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    const fnMatch = source.match(/export function sendChat\([\s\S]*?\n}\n/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![0];
    expect((body.match(/getConnections\(\)/g) ?? []).length).toBe(1);
    expect(body).not.toMatch(/seatFor/);
    // No conditional inside the send loop: the only `if` in this function is
    // permitted to be absent entirely.
    expect(body).not.toMatch(/\bif\s*\(/);
  });
});

describe('apps/party/src/handlers.ts handleChatSend shape (static, D-11)', () => {
  it('contains no read of message.codename or any other identity field', () => {
    const path = fileURLToPath(new URL('../src/handlers.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    const fnMatch = source.match(/export function handleChatSend\([\s\S]*?\n}\n/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![0];
    expect(body).not.toMatch(/message\.codename/);
    expect(body).not.toMatch(/message\.playerId/);
    expect(body).not.toMatch(/message\.seatIndex/);
    expect(body).not.toMatch(/message\.agentId/);
  });
});

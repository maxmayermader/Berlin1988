import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedRng } from '@berlin/engine';
import {
  chatMessageSchema,
  clientMessageSchema,
  CHAT_TEXT_MAX,
  type ChatMessage,
  type ServerMessage,
} from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { appendChat, chatScopeFor, CHAT_LOG_LIMIT } from '../src/chat.js';
import { handleChatSend } from '../src/handlers.js';
import { emptySeats, toSnapshot, type RoomState } from '../src/state.js';
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
    chat: { LOBBY: [], MATCH: [] },
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

describe('apps/party/src/chat.ts chatScopeFor (pure)', () => {
  it('maps LOBBY and LOADOUT to LOBBY, and IN_GAME and ENDED to MATCH', () => {
    expect(chatScopeFor('LOBBY')).toBe('LOBBY');
    expect(chatScopeFor('LOADOUT')).toBe('LOBBY');
    expect(chatScopeFor('IN_GAME')).toBe('MATCH');
    expect(chatScopeFor('ENDED')).toBe('MATCH');
  });
});

describe('apps/party/src/chat.ts appendChat (pure)', () => {
  function message(id: string, scope: ChatMessage['scope'] = 'LOBBY'): ChatMessage {
    return { id, scope, codename: 'Vogel', text: `text-${id}`, at: 0 };
  }

  it('keeps at most CHAT_LOG_LIMIT messages per scope, dropping the oldest first, order unchanged', () => {
    let state = fixtureState([0]);
    for (let i = 0; i < CHAT_LOG_LIMIT + 5; i++) {
      state = appendChat(state, message(`m${i}`));
    }
    expect(state.chat.LOBBY).toHaveLength(CHAT_LOG_LIMIT);
    expect(state.chat.LOBBY[0]!.id).toBe('m5');
    expect(state.chat.LOBBY[state.chat.LOBBY.length - 1]!.id).toBe(`m${CHAT_LOG_LIMIT + 4}`);
    // Order among the survivors is unchanged — every remaining id is
    // strictly increasing.
    const ids = state.chat.LOBBY.map((m) => Number(m.id.slice(1)));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('appending a MATCH-scope message never touches the LOBBY array', () => {
    let state = fixtureState([0]);
    state = appendChat(state, message('lobby-1', 'LOBBY'));
    state = appendChat(state, message('match-1', 'MATCH'));
    expect(state.chat.LOBBY).toHaveLength(1);
    expect(state.chat.MATCH).toHaveLength(1);
  });
});

describe('apps/party/src/state.ts toSnapshot (pure) — chat never enters the public snapshot', () => {
  it("toSnapshot(state)'s key set is unchanged for a state with a non-empty chat log", () => {
    let state = fixtureState([0]);
    state = appendChat(state, {
      id: 'm1',
      scope: 'LOBBY',
      codename: 'Vogel',
      text: 'hello',
      at: 0,
    });
    const snapshot = toSnapshot(state);
    expect(Object.keys(snapshot).sort()).toEqual(
      ['code', 'phase', 'hostPlayerId', 'seats', 'startsAt'].sort(),
    );
  });
});

describe('apps/party integration: chat follows the game (D-10)', () => {
  it('two lobby messages, then a match message after startMatch, land in two separate, correctly-sized logs', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'CHAT_SEND', text: 'first' });
    await host.send({ type: 'CHAT_SEND', text: 'second' });
    await host.send({ type: 'SET_SEAT_COUNT', count: 1 });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    expect(room.roomState()!.phase).toBe('IN_GAME');
    // The lobby log does not carry over — MATCH starts empty.
    expect(room.roomState()!.chat.MATCH).toHaveLength(0);

    await host.send({ type: 'CHAT_SEND', text: 'third' });

    expect(room.roomState()!.chat.LOBBY).toHaveLength(2);
    expect(room.roomState()!.chat.MATCH).toHaveLength(1);
  });

  it('a connection that JOINs a room still in LOBBY receives a CHAT_HISTORY frame for the LOBBY scope', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = room.roomState()!.code;
    await host.send({ type: 'CHAT_SEND', text: 'Berlin is nice this time of year.' });

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    const history = guest.received.find((m) => m.type === 'CHAT_HISTORY') as
      | Extract<ServerMessage, { type: 'CHAT_HISTORY' }>
      | undefined;
    expect(history).toBeDefined();
    expect(history!.scope).toBe('LOBBY');
    expect(history!.messages).toHaveLength(1);
  });

  it('a connection that reconnects (token rebind) to a room already IN_GAME receives a CHAT_HISTORY frame for the MATCH scope, matching the stored match log, and never the LOBBY log', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = room.roomState()!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    const guestJoined = guest.received.find((m) => m.type === 'JOINED') as Extract<
      ServerMessage,
      { type: 'JOINED' }
    >;

    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();
    expect(room.roomState()!.phase).toBe('IN_GAME');

    await host.send({ type: 'CHAT_SEND', text: 'Nice weather for a defection.' });
    expect(room.roomState()!.chat.MATCH).toHaveLength(1);

    const reconnect = room.connect('Katja');
    await reconnect.send({ type: 'JOIN', code, codename: 'Katja', token: guestJoined.token });

    const history = reconnect.received.find((m) => m.type === 'CHAT_HISTORY') as
      | Extract<ServerMessage, { type: 'CHAT_HISTORY' }>
      | undefined;
    expect(history).toBeDefined();
    expect(history!.scope).toBe('MATCH');
    expect(history!.messages).toHaveLength(room.roomState()!.chat.MATCH.length);
  });
});

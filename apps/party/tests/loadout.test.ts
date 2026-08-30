import { ALL_CARDS, DEFAULT_RULESET, HUNTER, OLIGARCH, PHANTOM, SPIDER, validateLoadout } from '@berlin/engine';
import { cardId } from '@berlin/shared';
import type { CardId, Loadout, LoadoutViolation, Sector, ServerMessage } from '@berlin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allFrames, createTestRoom, playMatch } from './helpers.js';

/**
 * The room half of the phase's tracer proof: a submitted loadout is what
 * startMatch deals that seat, end to end, through the room's own onMessage
 * routing, its loadout-submission handler, setLoadout, and startMatch. The
 * browser half (apps/web/e2e/deck.spec.ts) asserts the outbound
 * SUBMIT_LOADOUT frame the lobby sends; this file asserts what the room does
 * with an identically shaped frame once it arrives.
 *
 * Task 2 (below, added next) grows this into the room's full adversarial
 * contract — every phase guard, every violation code, the payload-size
 * boundary, and the elevation-of-privilege guard against a mid-match
 * resubmission — and Task 3 proves what a started match actually deals
 * every seat and that no frame a non-owning connection receives carries
 * another seat's cards.
 */

/** Mirrors createMatch.ts's defaultLoadoutFor(faction) — not exported from
 *  @berlin/engine's public barrel, so restated here against the engine's own
 *  STARTER_LOADOUTS exports rather than a hand-typed card list. */
const STARTER_FOR_FACTION: Record<Sector, Loadout> = {
  RED: HUNTER,
  BLUE: PHANTOM,
  GOLD: OLIGARCH,
  GREEN: SPIDER,
};

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

/** Stringifies a frame for leak-scanning with the always-public map topology
 *  removed first — mirrors fog-wire.test.ts/round.test.ts's own copy of this
 *  helper. `view.map` (node ids, names, edges) is sent in full to every
 *  connection regardless of any order, so leaving it in would risk a
 *  coincidental substring match against a card id. */
function stringifyWithoutMap(frame: ServerMessage): string {
  return JSON.stringify(frame, (key, value) => (key === 'map' ? undefined : value));
}

/** Task 2's five violation fixtures, each built by filtering ALL_CARDS
 *  rather than hand-typing ids, so a future content edit can't silently
 *  invalidate a fixture without also changing the violation it triggers. */

/** WRONG_SIZE: HUNTER's first three cards — happen to share one icon
 *  (STRIKE) and stay within every other constraint, so WRONG_SIZE is the
 *  only violation this fixture can produce. */
function shortDeck(): CardId[] {
  return [...HUNTER].slice(0, 3);
}

/** UNKNOWN_CARD: a full legal loadout plus one invented id. The only
 *  hand-typed card-id-shaped literal in this file, per the plan's own
 *  allowance — every other fixture is derived from the pool. */
function unknownCardDeck(): CardId[] {
  return [...HUNTER, cardId('zz_totally_made_up')];
}

/** ICON_LIMIT: every WIRETAP-icon card in the pool (more than maxPerIcon on
 *  its own), padded out to ten with cards of other icons. */
function iconLimitDeck(): CardId[] {
  const wiretaps = ALL_CARDS.filter((c) => c.icon === 'WIRETAP').map((c) => c.id);
  const rest = ALL_CARDS.filter((c) => c.icon !== 'WIRETAP').map((c) => c.id);
  return [...wiretaps, ...rest.slice(0, Math.max(0, 10 - wiretaps.length))];
}

/** TOO_FEW_COLORS: every GOLD-sector card in the pool (nine), padded to ten
 *  by repeating the first one. GOLD's nine cards happen to land at exactly
 *  26 Budget Points once repeated and never exceed maxPerIcon, so this
 *  fixture triggers TOO_FEW_COLORS alone. */
function tooFewColorsDeck(): CardId[] {
  const gold = ALL_CARDS.filter((c) => c.sector === 'GOLD').map((c) => c.id);
  const deck = [...gold];
  while (deck.length < 10) deck.push(gold[deck.length % gold.length]!);
  return deck;
}

/** OVER_BUDGET: the ten most expensive cards in the pool by Budget Points. */
function overBudgetDeck(): CardId[] {
  return [...ALL_CARDS]
    .sort((a, b) => b.budgetPoints - a.budgetPoints)
    .slice(0, 10)
    .map((c) => c.id);
}

/** A single real card id, drawn from the pool rather than hand-typed, for the
 *  payload-bound cases below — they only need a card id the wire schema will
 *  parse, not a legal loadout's worth of distinct ones. */
const REPEATABLE_CARD_ID: CardId = ALL_CARDS[0]!.id;

describe('apps/party SUBMIT_LOADOUT -> startMatch integration', () => {
  it('a submitted loadout is dealt to that seat at match start; every bot seat keeps its faction starter', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');

    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });

    const ack = host.last();
    expect(ack?.type).toBe('LOADOUT_ACK');
    expect(ack?.type === 'LOADOUT_ACK' && ack.cards).toEqual([...HUNTER]);

    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    const state = room.roomState();
    expect(state?.phase).toBe('IN_GAME');
    expect(state?.gameState).not.toBeNull();

    for (const seat of state!.seats) {
      if (!seat.playerId) continue;
      const player = state!.gameState!.players[seat.playerId];
      expect(player).toBeDefined();
      if (seat.kind === 'BOT') {
        expect(player!.loadout).toEqual([...STARTER_FOR_FACTION[seat.faction]]);
      } else {
        // The host is the only human seat and submitted HUNTER before ready.
        expect(player!.loadout).toEqual([...HUNTER]);
      }
    }
  });

  it('an illegal loadout is rejected with LOADOUT_REJECTED and never stored', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');

    await host.send({ type: 'CREATE', codename: 'Vogel' });
    // Five cards is not a legal 10-card loadout — WRONG_SIZE.
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER].slice(0, 5) });

    const reply = host.last();
    expect(reply?.type).toBe('LOADOUT_REJECTED');
    expect(reply?.type === 'LOADOUT_REJECTED' && reply.message.length).toBeGreaterThan(0);

    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    const state = room.roomState();
    const hostPlayerId = state!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    // The rejected submission never landed on RoomSeat.loadout, so
    // startMatch's own PHANTOM fallback is what the host actually plays.
    expect(state!.gameState!.players[hostPlayerId]!.loadout).toEqual([...PHANTOM]);
  });

  it('SUBMIT_LOADOUT from an unbound connection is a silent no-op — no state change, no reply', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    const stray = room.connect();
    const before = room.roomState();
    await stray.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });

    expect(stray.received).toHaveLength(0);
    expect(room.roomState()).toEqual(before);
  });

  /**
   * Task 1: the mirror image of the tracer's happy path — two human seats,
   * each owning their own deck, a rejection that destroys nothing, and a
   * match that deals each of them exactly what they submitted. Exercises
   * wire parsing, room routing, seatFor scoping, engine validation, the
   * reducer's per-seat immutability, and startMatch's per-seat read, all on
   * the path a real client never takes.
   */
  it('two human seats each own their own deck; a rejected submission destroys nothing; the match deals each seat what it submitted', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    await guest.send({ type: 'SUBMIT_LOADOUT', cards: [...OLIGARCH] });

    const seatFor = (codename: string) =>
      room.roomState()!.seats.find((s) => s.codename === codename)!;

    expect(seatFor('Vogel').loadout).toEqual([...HUNTER]);
    expect(seatFor('Katja').loadout).toEqual([...OLIGARCH]);

    // An obviously illegal deck from the guest — must not touch either seat.
    await guest.send({ type: 'SUBMIT_LOADOUT', cards: [] });
    const rejection = guest.last();
    expect(rejection?.type).toBe('LOADOUT_REJECTED');
    expect(rejection?.type === 'LOADOUT_REJECTED' && rejection.message.length).toBeGreaterThan(0);
    expect(seatFor('Katja').loadout).toEqual([...OLIGARCH]); // unchanged by the rejection
    expect(seatFor('Vogel').loadout).toEqual([...HUNTER]); // untouched by the OTHER seat's submission

    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    const state = room.roomState();
    const hostPlayerId = state!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    const guestPlayerId = state!.seats.find((s) => s.codename === 'Katja')!.playerId!;
    expect(state!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);
    expect(state!.gameState!.players[guestPlayerId]!.loadout).toEqual([...OLIGARCH]);
  });
});


/**
 * Task 2: the room's answer is the engine's answer, in every phase. Every
 * case here drives the room's own onMessage through createTestRoom, never
 * the loadout handler function directly, so a routing regression in room.ts
 * would be caught the same way a handler-level bug would be.
 */
describe('apps/party SUBMIT_LOADOUT phase guards and violation handling (Task 2)', () => {
  it('submitting the same legal deck twice produces two acknowledgements and one unchanged stored value', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    const first = host.last();
    expect(first?.type).toBe('LOADOUT_ACK');
    expect(first?.type === 'LOADOUT_ACK' && first.cards).toEqual([...HUNTER]);

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    const second = host.last();
    expect(second?.type).toBe('LOADOUT_ACK');
    expect(second?.type === 'LOADOUT_ACK' && second.cards).toEqual([...HUNTER]);

    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toEqual([...HUNTER]);
  });

  it('a legal-but-different submission replaces the stored deck wholesale, with no merge and no residue', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...OLIGARCH] });

    const ack = host.last();
    expect(ack?.type === 'LOADOUT_ACK' && ack.cards).toEqual([...OLIGARCH]);

    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toEqual([...OLIGARCH]);
    // No card unique to HUNTER survives the overwrite.
    const hunterOnly = HUNTER.filter((id) => !OLIGARCH.includes(id));
    expect(hunterOnly.length).toBeGreaterThan(0);
    for (const id of hunterOnly) {
      expect(seat.loadout).not.toContain(id);
    }
  });

  it('a rejected submission leaves the previously stored deck exactly as it was', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    await host.send({ type: 'SUBMIT_LOADOUT', cards: shortDeck() });

    const reply = host.last();
    expect(reply?.type).toBe('LOADOUT_REJECTED');

    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toEqual([...HUNTER]);
  });

  const violationFixtures: Record<LoadoutViolation['code'], CardId[]> = {
    'WRONG_SIZE': shortDeck(),
    'UNKNOWN_CARD': unknownCardDeck(),
    'ICON_LIMIT': iconLimitDeck(),
    'TOO_FEW_COLORS': tooFewColorsDeck(),
    'OVER_BUDGET': overBudgetDeck(),
  };

  it.each(Object.entries(violationFixtures) as [LoadoutViolation['code'], CardId[]][])(
    'rejects a %s loadout with the engine\'s own message',
    async (code, cards) => {
      const room = createTestRoom();
      const host = room.connect('Vogel');
      await host.send({ type: 'CREATE', codename: 'Vogel' });
      await host.send({ type: 'SUBMIT_LOADOUT', cards });

      const reply = host.last();
      expect(reply?.type).toBe('LOADOUT_REJECTED');

      // The rejection text can never drift from the engine's own wording —
      // computed here, never restated.
      const violations = validateLoadout(cards, DEFAULT_RULESET);
      const expected = violations.find((v) => v.code === code);
      expect(expected, `fixture for ${code} did not actually trigger it`).toBeDefined();
      expect(reply?.type === 'LOADOUT_REJECTED' && reply.message).toContain(expected!.message);
    },
  );

  it('accepts a submission from a seat whose ready flag is already set — D-05 clears ready separately', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    const reply = host.last();
    expect(reply?.type).toBe('LOADOUT_ACK');

    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toEqual([...HUNTER]);
  });

  it('rejects a payload past the wire bound as a malformed frame, before any engine call', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    // 65 > SUBMIT_LOADOUT's schema bound of 64 — never reaches validateLoadout.
    await host.send({ type: 'SUBMIT_LOADOUT', cards: Array(65).fill(REPEATABLE_CARD_ID) });

    const reply = host.last();
    expect(reply?.type).toBe('ERROR');
    expect(reply?.type === 'ERROR' && reply.code).toBe('BAD_MESSAGE');

    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toBeNull();
  });

  it('accepts a payload of exactly the wire bound length, then rejects it as WRONG_SIZE from the engine', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    const atBound: CardId[] = Array(64).fill(REPEATABLE_CARD_ID);
    await host.send({ type: 'SUBMIT_LOADOUT', cards: atBound });

    const reply = host.last();
    expect(reply?.type).toBe('LOADOUT_REJECTED');
    const violations = validateLoadout(atBound, DEFAULT_RULESET);
    const wrongSize = violations.find((v) => v.code === 'WRONG_SIZE');
    expect(wrongSize).toBeDefined();
    expect(reply?.type === 'LOADOUT_REJECTED' && reply.message).toContain(wrongSize!.message);
  });

  it('refuses a submission once the room is IN_GAME, and neither the seat nor the running match own deck moves', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // -> IN_GAME, 1 human + 3 bots

    expect(room.roomState()!.phase).toBe('IN_GAME');
    const hostPlayerId = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    expect(room.roomState()!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...OLIGARCH] });
    const reply = host.last();
    expect(reply?.type).toBe('ERROR');
    expect(reply?.type === 'ERROR' && reply.code).toBe('WRONG_PHASE');

    // Neither the room's own bookkeeping nor the running match's dealt
    // loadout moved — this is the elevation-of-privilege guard (T-2-07):
    // a player cannot swap decks mid-match through a socket they already
    // legitimately hold.
    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toEqual([...HUNTER]);
    expect(room.roomState()!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);
  });

  describe('once the room has ended', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('refuses a submission with WRONG_PHASE and leaves the stored deck untouched', async () => {
      const room = createTestRoom('loadout-ended');
      // roundLimit is locked to 14 — 15 rounds of auto-Hold/bot play
      // guarantees ROUND_LIMIT fires and the room reaches ENDED.
      const played = await playMatch(room, 15);
      expect(room.roomState()!.phase).toBe('ENDED');

      const hostPlayerId = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
      const before = room.roomState()!.gameState!.players[hostPlayerId]!.loadout;

      await played.host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
      const reply = played.host.last();
      expect(reply?.type).toBe('ERROR');
      expect(reply?.type === 'ERROR' && reply.code).toBe('WRONG_PHASE');

      expect(room.roomState()!.gameState!.players[hostPlayerId]!.loadout).toEqual(before);
    });
  });

  it('accepts a submission while the room phase is LOADOUT, matching startMatch\'s own guard', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    // No production path ever sets this phase today (A3, 02-RESEARCH.md) —
    // setLoadout's guard already admits it, so this proves that admission
    // directly rather than waiting on a future phase-transition feature.
    // Mutates the room's own live state object, the same one room.ts holds,
    // never a copy — the same technique fog-wire.test.ts/botfill.test.ts use
    // to read expected values from live state rather than a fixture.
    const state = room.roomState();
    expect(state).not.toBeNull();
    state!.phase = 'LOADOUT';

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    const reply = host.last();
    expect(reply?.type).toBe('LOADOUT_ACK');

    const seat = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!;
    expect(seat.loadout).toEqual([...HUNTER]);
  });
});

/**
 * Task 3: match start deals the right deck to every seat, and tells no one
 * else. The bot-roster and startMatch-idempotence cases already live in
 * apps/party/tests/botfill.test.ts (Plan 02-01/02-03) — this describe block
 * covers the multi-human match-start cases and the fog/structural proof that
 * belong at the room-integration level.
 */
describe('apps/party startMatch dealing per-seat loadouts (Task 3)', () => {
  it('a four-human room deals each seat exactly the distinct legal deck it submitted', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel'); // seat 0, RED
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guests = [];
    for (const codename of ['Katja', 'Marek', 'Halloran']) {
      const guest = room.connect(codename);
      await guest.send({ type: 'JOIN', code, codename });
      guests.push(guest);
    }
    const [katja, marek, halloran] = guests;

    const decks: Record<string, Loadout> = {
      Vogel: HUNTER,
      Katja: OLIGARCH,
      Marek: SPIDER,
      Halloran: PHANTOM,
    };

    for (const conn of [host, ...guests]) {
      const codename = conn === host ? 'Vogel' : conn === katja ? 'Katja' : conn === marek ? 'Marek' : 'Halloran';
      await conn.send({ type: 'SUBMIT_LOADOUT', cards: [...decks[codename]!] });
    }
    for (const conn of [host, ...guests]) {
      await conn.send({ type: 'SET_READY', ready: true });
    }

    await room.triggerAlarm();

    const state = room.roomState();
    expect(state!.phase).toBe('IN_GAME');
    expect(state!.seats.filter((s) => s.kind === 'HUMAN')).toHaveLength(4);

    const seenLoadouts = new Set<string>();
    for (const seat of state!.seats) {
      const player = state!.gameState!.players[seat.playerId!]!;
      expect(player.loadout).toEqual([...decks[seat.codename!]!]);
      seenLoadouts.add(JSON.stringify(player.loadout));
    }
    // Four humans, four distinct submitted decks — no two seats confused.
    expect(seenLoadouts.size).toBe(4);
  });

  it('no frame a non-owning connection received across the whole lobby-to-match-start sequence contains the owner\'s card ids, and every snapshot seat has exactly six keys', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    // PHANTOM and OLIGARCH share no card ids — the only pair among the four
    // starter presets with zero overlap — so a card id found in the other
    // connection's frames can only mean a leak, never a coincidence of both
    // seats legitimately holding the same card.
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...PHANTOM] });
    await guest.send({ type: 'SUBMIT_LOADOUT', cards: [...OLIGARCH] });
    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    // Read the expected secrets from the room's own live state, never a
    // fixture — mirrors fog-wire.test.ts's approach.
    const hostCardIds = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!.loadout!;
    const guestCardIds = room.roomState()!.seats.find((s) => s.codename === 'Katja')!.loadout!;

    const guestFrames = allFrames(guest).map(stringifyWithoutMap).join('␞');
    for (const id of hostCardIds) {
      expect(guestFrames, `host card ${id} leaked to the guest`).not.toContain(id as unknown as string);
    }
    const hostFrames = allFrames(host).map(stringifyWithoutMap).join('␞');
    for (const id of guestCardIds) {
      expect(hostFrames, `guest card ${id} leaked to the host`).not.toContain(id as unknown as string);
    }

    const snapshot = last(host.received, 'ROOM_STATE')!.snapshot;
    expect(snapshot.seats.length).toBeGreaterThan(0);
    for (const seat of snapshot.seats) {
      expect(Object.keys(seat)).toHaveLength(6);
    }
  });

  it('a deck submitted after startMatch has run does not change any player\'s loadout in the running match', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    const hostPlayerId = room.roomState()!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    expect(room.roomState()!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...OLIGARCH] });

    expect(room.roomState()!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);
  });
});

/**
 * Plan 02-04, Task 2: the literal D-05 flow this plan's in-lobby editor
 * drives — ready, open the editor (SET_READY false), edit and save
 * (SUBMIT_LOADOUT), ready again — proven against the room's own router the
 * same way every other case in this file is, never against setLoadout or
 * setReady directly.
 */
describe('apps/party the in-lobby editor flow: ready, edit, save, ready again (Plan 02-04, Task 2)', () => {
  it('the literal D-05 sequence deals the seat its submitted deck at match start', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    await host.send({ type: 'SET_READY', ready: true });
    await host.send({ type: 'SET_READY', ready: false }); // opening the editor (D-05)
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] }); // save
    await host.send({ type: 'SET_READY', ready: true }); // re-confirm

    await room.triggerAlarm();

    const state = room.roomState();
    expect(state!.phase).toBe('IN_GAME');
    const hostPlayerId = state!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    expect(state!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);
  });

  it('a submission that arrives while the seat is already ready (no editor open) is still accepted and dealt', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });

    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...OLIGARCH] });
    expect(host.last()?.type).toBe('LOADOUT_ACK');

    await room.triggerAlarm();

    const state = room.roomState();
    const hostPlayerId = state!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    expect(state!.gameState!.players[hostPlayerId]!.loadout).toEqual([...OLIGARCH]);
  });

  it('a seat that opens the editor and never saves plays the deck it last successfully submitted, not a browser-only draft the room was never told about', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    // The seat's one and only successful submission.
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });

    // "Opens the editor and never saves": ready clears, then re-readies
    // with no further SUBMIT_LOADOUT in between — the room was never told
    // about whatever the player may have clicked in the meantime.
    await host.send({ type: 'SET_READY', ready: true });
    await host.send({ type: 'SET_READY', ready: false });
    await host.send({ type: 'SET_READY', ready: true });

    await room.triggerAlarm();

    const state = room.roomState();
    const hostPlayerId = state!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    expect(state!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);
  });

  it('opening the editor mid-countdown drops a two-seat room below the ready threshold and stops it', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    // 2 filled, 1 ready is exactly the inclusive 50% threshold — the
    // countdown is already running on the host's ready-up alone, the same
    // fixture apps/party/tests/lobby.test.ts uses.
    await host.send({ type: 'SET_READY', ready: true });
    expect(room.roomState()!.startsAt).not.toBeNull();

    // The host opens the in-lobby editor: D-05's ready clear drops the
    // ratio to 0/2, below the threshold, and the countdown stops.
    await host.send({ type: 'SET_READY', ready: false });
    expect(room.roomState()!.startsAt).toBeNull();
  });

  it('two seats each opening, editing, and saving in the same window end up with their own distinct deck; neither clobbers the other', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const code = last(host.received, 'JOINED')!.code;

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });

    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });

    // Both open their editors (D-05) in the same window...
    await host.send({ type: 'SET_READY', ready: false });
    await guest.send({ type: 'SET_READY', ready: false });
    // ...edit and save distinct decks, interleaved...
    await host.send({ type: 'SUBMIT_LOADOUT', cards: [...HUNTER] });
    await guest.send({ type: 'SUBMIT_LOADOUT', cards: [...SPIDER] });
    // ...and re-confirm.
    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });

    await room.triggerAlarm();

    const state = room.roomState();
    const hostPlayerId = state!.seats.find((s) => s.codename === 'Vogel')!.playerId!;
    const guestPlayerId = state!.seats.find((s) => s.codename === 'Katja')!.playerId!;
    expect(state!.gameState!.players[hostPlayerId]!.loadout).toEqual([...HUNTER]);
    expect(state!.gameState!.players[guestPlayerId]!.loadout).toEqual([...SPIDER]);
  });
});

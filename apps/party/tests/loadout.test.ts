import { HUNTER, OLIGARCH, PHANTOM, SPIDER } from '@berlin/engine';
import type { Loadout, Sector, ServerMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { createTestRoom } from './helpers.js';

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

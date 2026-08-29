import { HUNTER, OLIGARCH, PHANTOM, SPIDER } from '@berlin/engine';
import type { Loadout, Sector } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { createTestRoom } from './helpers.js';

/**
 * The room half of the phase's tracer proof: a submitted loadout is what
 * startMatch deals that seat, end to end, through the room's own onMessage
 * -> handleSubmitLoadout -> setLoadout -> startMatch path. The browser half
 * (apps/web/e2e/deck.spec.ts) asserts the outbound SUBMIT_LOADOUT frame the
 * lobby sends; this file asserts what the room does with an identically
 * shaped frame once it arrives.
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
});

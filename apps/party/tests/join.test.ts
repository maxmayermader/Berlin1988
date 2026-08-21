import type { ServerMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
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

describe('apps/party join flow (tracer)', () => {
  it('CREATE mints a code; a second connection JOINs it and both see two seats', async () => {
    const room = createTestRoom();

    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const created = last(host.received, 'JOINED');
    if (!created) throw new Error(`expected JOINED, got ${JSON.stringify(host.received)}`);
    const code = created.code;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const guest = room.connect('Katja');
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    const joined = last(guest.received, 'JOINED');
    expect(joined).toBeDefined();

    const hostSnapshot = last(host.received, 'ROOM_STATE');
    const guestSnapshot = last(guest.received, 'ROOM_STATE');
    expect(hostSnapshot).toBeDefined();
    expect(guestSnapshot).toBeDefined();

    const hostSeats = hostSnapshot!.snapshot.seats.filter((seat) => seat.kind === 'HUMAN');
    const guestSeats = guestSnapshot!.snapshot.seats.filter((seat) => seat.kind === 'HUMAN');
    expect(hostSeats).toHaveLength(2);
    expect(guestSeats).toHaveLength(2);
    expect(hostSeats[0]!.playerId).not.toBe(hostSeats[1]!.playerId);
    expect(hostSeats.map((seat) => seat.codename).sort()).toEqual(['Katja', 'Vogel']);
    expect(hostSnapshot!.snapshot.code).toBe(code);
    expect(guestSnapshot!.snapshot.code).toBe(code);
  });

  it('rejects a JOIN against an unknown code', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });

    const stranger = room.connect('Marek');
    await stranger.send({ type: 'JOIN', code: 'ZZZZZZ', codename: 'Marek' });
    const reply = stranger.last();
    expect(reply?.type).toBe('ERROR');
    if (reply?.type === 'ERROR') {
      expect(reply.code).toBe('UNKNOWN_CODE');
    }
  });
});

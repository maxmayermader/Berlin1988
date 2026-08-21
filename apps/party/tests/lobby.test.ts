import type { ClientMessage, ServerMessage } from '@berlin/shared';
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

import { neighbours } from '@berlin/engine';
import type { ServerMessage } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { createTestRoom } from './helpers.js';

/**
 * Task 1 tracer: submit -> seal -> resolve -> project, end to end through a
 * real room. The sealed-order case is the tracer's proof of MATCH-03 — see
 * fog-wire.test.ts (Task 3) for the full multi-round, multi-seat scan.
 */

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

/** Two humans, both ready, alarm fired — lands IN_GAME with agentsPerPlayer
 *  locked to 1 (D-02), so each seat's single agent committing is exactly
 *  what closes the round. */
async function startTwoPlayerMatch() {
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

  // Seats 2 and 3 are auto-filled with bots at match start
  // (fillEmptySeatsWithBots) since SEAT_COUNT is 4. Task 3 wires real
  // AI-decided bot submissions; until then, holdSeat() submits a HOLD for
  // each bot seat's agents through the identical handleSubmitOrder path a
  // human connection uses, so allCommitted() in these tests only waits on
  // the two human seats the tests drive directly.
  await room.holdSeat(2);
  await room.holdSeat(3);

  return { room, host, guest, hostPlayerId, guestPlayerId };
}

/**
 * Stringifies a frame for leak-scanning, with the always-public map
 * topology removed first. `view.map` (node ids, names, edges) is sent in
 * full to every connection regardless of any order — it is the board
 * itself, not hidden state — so leaving it in would make every node id a
 * guaranteed false-positive substring match. What must never appear is a
 * node id somewhere OTHER than that public topology listing (e.g. an
 * opponent's agent position or a move target).
 */
function stringifyWithoutMap(frame: ServerMessage): string {
  return JSON.stringify(frame, (key, value) => (key === 'map' ? undefined : value));
}

describe('apps/party round loop (Task 1 tracer)', () => {
  it('a submitted order is held secret; the other connection sees only a commit count', async () => {
    const { host, guest, hostPlayerId } = await startTwoPlayerMatch();

    const hostView = last(host.received, 'VIEW')!.view;
    const hostAgent = hostView.self.agents[0]!;
    const to = neighbours(hostView.map, hostAgent.nodeId)[0]!;

    await host.send({
      type: 'SUBMIT_ORDER',
      round: hostView.round,
      agentId: hostAgent.id,
      actions: [{ type: 'MOVE', to }],
    });

    expect(last(host.received, 'ORDER_ACK')).toBeDefined();
    expect(last(host.received, 'ORDER_REJECTED')).toBeUndefined();

    const committed = last(guest.received, 'OPPONENT_COMMITTED');
    expect(committed).toBeDefined();
    expect(committed!.playerId).toBe(hostPlayerId);
    expect(committed!.agentsCommitted).toBe(1);
    expect(committed!.agentsTotal).toBe(1);

    // No frame guest has received AT ANY POINT contains the node id host
    // moved to, outside the always-public map topology — the sealed-order
    // proof.
    for (const frame of guest.received) {
      expect(
        stringifyWithoutMap(frame),
        `frame ${frame.type} leaked the MOVE target`,
      ).not.toContain(to as unknown as string);
    }
  });

  it('the round resolves once both agents commit, and each connection gets its own projected view', async () => {
    const { host, guest } = await startTwoPlayerMatch();

    const hostView = last(host.received, 'VIEW')!.view;
    const guestView = last(guest.received, 'VIEW')!.view;
    const hostAgent = hostView.self.agents[0]!;
    const guestAgent = guestView.self.agents[0]!;

    await host.send({
      type: 'SUBMIT_ORDER',
      round: hostView.round,
      agentId: hostAgent.id,
      actions: [{ type: 'HOLD' }],
    });
    // Not resolved yet — only one of two agents has committed.
    expect(last(host.received, 'ROUND_RESOLVED')).toBeUndefined();

    await guest.send({
      type: 'SUBMIT_ORDER',
      round: guestView.round,
      agentId: guestAgent.id,
      actions: [{ type: 'HOLD' }],
    });

    const hostResolved = last(host.received, 'ROUND_RESOLVED');
    const guestResolved = last(guest.received, 'ROUND_RESOLVED');
    expect(hostResolved).toBeDefined();
    expect(guestResolved).toBeDefined();
    expect(JSON.stringify(hostResolved)).not.toBe(JSON.stringify(guestResolved));
    expect(hostResolved!.view.self.id).toBe(hostView.self.id);
    expect(guestResolved!.view.self.id).toBe(guestView.self.id);
    // Round advanced — proof resolveRound() actually ran.
    expect(hostResolved!.view.round).toBe(hostView.round + 1);
  });

  it('a stale round value is rejected with an ERROR frame rather than a state change', async () => {
    const { host } = await startTwoPlayerMatch();
    const hostView = last(host.received, 'VIEW')!.view;
    const hostAgent = hostView.self.agents[0]!;

    await host.send({
      type: 'SUBMIT_ORDER',
      round: hostView.round + 5,
      agentId: hostAgent.id,
      actions: [{ type: 'HOLD' }],
    });

    expect(last(host.received, 'ERROR')).toBeDefined();
    expect(last(host.received, 'ORDER_ACK')).toBeUndefined();
  });

  it('three actions for one agent is refused at the schema boundary with BAD_MESSAGE', async () => {
    const { host } = await startTwoPlayerMatch();
    const hostView = last(host.received, 'VIEW')!.view;
    const hostAgent = hostView.self.agents[0]!;

    await host.send({
      type: 'SUBMIT_ORDER',
      round: hostView.round,
      agentId: hostAgent.id,
      actions: [{ type: 'HOLD' }, { type: 'HOLD' }, { type: 'HOLD' }],
    });

    const error = last(host.received, 'ERROR');
    expect(error).toBeDefined();
    expect(error!.code).toBe('BAD_MESSAGE');
    expect(last(host.received, 'ORDER_ACK')).toBeUndefined();
  });
});

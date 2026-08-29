import { createMatch, quickSettings, seedRng } from '@berlin/engine';
import { PERSONALITY_IDS } from '@berlin/ai';
import type { AIAgent } from '@berlin/ai';
import { playerId as toPlayerId } from '@berlin/shared';
import type { MatchSettings, PersonalityId, ServerMessage } from '@berlin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decideForBotSeats, releaseBotSubmissions, BOT_DIFFICULTY } from '../src/bots.js';
import type { RoomSeat, RoomState } from '../src/state.js';
import { allFrames, createTestRoom, playMatch } from './helpers.js';

/**
 * The phase's highest-priority test (01-VALIDATION.md; ROADMAP.md's
 * wire-level fog-of-war research flag). packages/engine/tests/fog-leak.test.ts
 * proves projectView() never hands a client someone else's agent, safehouse,
 * trap, or cooldown. This file is the same claim moved one layer up — from
 * "what does projectView return" to "what did this socket actually
 * receive" — because PlayerView being type-safe is not the same as the
 * *frame apps/party/src/broadcast.ts actually serialized* being wire-safe:
 * a debug route, an accidental room-wide fan-out, or a hand-built message
 * literal could still leak, and only a literal JSON scan over recorded
 * frames catches that class of bug.
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

/**
 * Stringifies a frame for leak-scanning with the always-public map topology
 * removed first — mirroring round.test.ts's stringifyWithoutMap. `view.map`
 * (node ids, names, edges) is sent in full to every connection regardless of
 * any order; leaving it in would make every node id a guaranteed
 * false-positive substring match. What must never appear is a node id
 * somewhere OTHER than that public topology listing.
 */
function stringifyWithoutMap(frame: ServerMessage): string {
  return JSON.stringify(frame, (key, value) => (key === 'map' ? undefined : value));
}

/** Code-shaped room ids (apps/party/src/handlers.ts's JOIN_CODE_SHAPE) so
 *  `RoomState.matchId` becomes the id itself rather than a freshly minted
 *  random code — which is what makes two createTestRoom() calls against the
 *  same id produce the same seeded bot roster and the same seeded bot
 *  decisions (apps/party/src/settings.ts startMatch, apps/party/src/bots.ts
 *  decideForBotSeats). A non-code-shaped id would still play correctly, it
 *  would just no longer be comparable across two independent rooms. */
const ROOM_IDS = ['FOGWA1', 'FOGWA2', 'FOGWA3'];
const ROUNDS_PER_ROOM = 6;

describe('apps/party wire-level fog of war (Task 3 — the phase\'s highest-priority test)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe.each(ROOM_IDS)('a 1-human/3-bot match over %s rounds', (roomId) => {
    it(`no frame the host connection received across ${ROUNDS_PER_ROOM} rounds contains another player's agent id, trap id, or decoy id`, async () => {
      const room = createTestRoom(roomId);
      const played = await playMatch(room, ROUNDS_PER_ROOM);
      const state = room.roomState();
      expect(state).not.toBeNull();
      const gameState = state!.gameState;
      expect(gameState).not.toBeNull();

      const hostSeat = state!.seats.find((s) => s.kind === 'HUMAN');
      expect(hostSeat?.playerId).toBeDefined();
      const hostPlayerId = hostSeat!.playerId!;

      // Every frame the host connection ever received, across the whole
      // match, concatenated — the expected-secret values below are read
      // from the room's own live GameState, exactly as
      // packages/engine/tests/fog-leak.test.ts reads them from GameState,
      // never from a hardcoded fixture. Agent/trap/decoy ids are unique,
      // opaque instance identifiers (never a value that also legitimately
      // appears elsewhere on the wire), unlike a safehouse's value — a
      // NodeId — which is also the name of a public map location and is
      // checked structurally below instead of by string containment.
      const combined = allFrames(played.host).map(stringifyWithoutMap).join('␞');

      for (const [pid, player] of Object.entries(gameState!.players)) {
        if (pid === hostPlayerId) continue; // the viewer's own state is entitled
        for (const agent of player.agents) {
          expect(combined, `agent ${agent.id} of ${pid} leaked to the host`).not.toContain(
            agent.id as unknown as string,
          );
        }
      }

      for (const trap of gameState!.traps) {
        if (trap.ownerId === hostPlayerId) continue;
        expect(combined, `trap ${trap.id} leaked to the host`).not.toContain(trap.id);
      }
      for (const decoy of gameState!.decoys) {
        if (decoy.ownerId === hostPlayerId) continue;
        expect(combined, `decoy ${decoy.id} leaked to the host`).not.toContain(decoy.id);
      }
    });

    it("no opponent entry in any VIEW or ROUND_RESOLVED frame carries a field that could hold a safehouse, agent list, trap list, decoy list, or cooldown map", async () => {
      // A safehouse's value is a NodeId — the name of a public map location
      // — so it cannot be caught by string containment the way an agent,
      // trap, or decoy id can (this exact false positive is why: a bot's
      // safehouse can legitimately be a node the host's own visibleNodes
      // also names, for an unrelated reason). The wire-safe claim is
      // structural instead, extending packages/engine/tests/fog-leak.test.ts's
      // "OpponentPublicInfo has no field that could hold hidden state" up
      // to the literal frames a socket received.
      const room = createTestRoom(roomId);
      const played = await playMatch(room, ROUNDS_PER_ROOM);
      const opponentBearingFrames = allFrames(played.host).filter(
        (f): f is Extract<ServerMessage, { type: 'VIEW' | 'ROUND_RESOLVED' }> =>
          f.type === 'VIEW' || f.type === 'ROUND_RESOLVED',
      );
      expect(opponentBearingFrames.length).toBeGreaterThan(0);

      const forbiddenOpponentKeys = [
        'safehouse',
        'agents',
        'traps',
        'decoys',
        'cooldowns',
        'loadout',
        'passivesAvailable',
        'nodeId',
      ];
      let opponentsChecked = 0;
      for (const frame of opponentBearingFrames) {
        for (const opponent of frame.view.opponents) {
          opponentsChecked++;
          const keys = Object.keys(opponent);
          for (const forbidden of forbiddenOpponentKeys) {
            expect(keys, `opponent ${opponent.id} exposes ${forbidden}`).not.toContain(forbidden);
          }
        }
      }
      expect(opponentsChecked).toBeGreaterThan(0);
    });

    it('no frame the host connection received contains the raw GameState-only keys pendingOrders, playerOrder, blockadeSchedule, nextEntityId, or lastRoundLog', async () => {
      const room = createTestRoom(roomId);
      const played = await playMatch(room, ROUNDS_PER_ROOM);
      const combined = JSON.stringify(allFrames(played.host));

      for (const forbidden of [
        'pendingOrders',
        'playerOrder',
        'blockadeSchedule',
        'nextEntityId',
        'lastRoundLog',
      ]) {
        expect(combined, `key "${forbidden}" appeared in a frame`).not.toContain(`"${forbidden}"`);
      }
    });

    it("during the order phase, no frame the host connection received contains the target node id of another seat's submitted MOVE or STRIKE", async () => {
      const room = createTestRoom(roomId);
      const played = await playMatch(room, ROUNDS_PER_ROOM);

      for (const record of played.rounds) {
        if (record.botOrderTargets.length === 0) continue;
        const combined = record.framesDuringOrders.map(stringifyWithoutMap).join('␞');
        for (const target of record.botOrderTargets) {
          expect(
            combined,
            `round ${record.round}: a bot's MOVE/STRIKE target ${target} appeared in a frame the host received before that round resolved`,
          ).not.toContain(target);
        }
      }
    });
  });

  it('every OPPONENT_COMMITTED frame has exactly the keys type, playerId, agentsCommitted, agentsTotal', async () => {
    const room = createTestRoom(ROOM_IDS[0]!);
    const played = await playMatch(room, ROUNDS_PER_ROOM);
    const committedFrames = allFrames(played.host).filter(
      (f): f is Extract<ServerMessage, { type: 'OPPONENT_COMMITTED' }> => f.type === 'OPPONENT_COMMITTED',
    );
    expect(committedFrames.length).toBeGreaterThan(0);
    for (const frame of committedFrames) {
      expect(Object.keys(frame).sort()).toEqual(
        ['agentsCommitted', 'agentsTotal', 'playerId', 'type'].sort(),
      );
    }
  });

  it('every ROUND_RESOLVED frame has exactly the keys type and view', async () => {
    const room = createTestRoom(ROOM_IDS[0]!);
    const played = await playMatch(room, ROUNDS_PER_ROOM);
    const resolvedFrames = allFrames(played.host).filter(
      (f): f is Extract<ServerMessage, { type: 'ROUND_RESOLVED' }> => f.type === 'ROUND_RESOLVED',
    );
    expect(resolvedFrames.length).toBeGreaterThan(0);
    for (const frame of resolvedFrames) {
      expect(Object.keys(frame).sort()).toEqual(['type', 'view'].sort());
    }
  });

  it('no bot submission is recorded earlier than 1500ms after its round started', async () => {
    const room = createTestRoom(ROOM_IDS[0]!);
    const played = await playMatch(room, ROUNDS_PER_ROOM);
    let checked = 0;
    for (const record of played.rounds) {
      if (record.roundStartAt === null) continue;
      for (const submission of record.botSubmissions) {
        checked++;
        expect(submission.releaseAt - record.roundStartAt).toBeGreaterThanOrEqual(1500);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('two rooms built from the same room id produce identical bot orders for round 1', async () => {
    const roomA = createTestRoom(ROOM_IDS[0]!);
    const playedA = await playMatch(roomA, 1);
    const roomB = createTestRoom(ROOM_IDS[0]!);
    const playedB = await playMatch(roomB, 1);

    const ordersOf = (played: Awaited<ReturnType<typeof playMatch>>) =>
      played.rounds[0]!.botSubmissions
        .map((s) => ({ playerId: s.playerId, actions: s.order.actions }))
        .sort((x, y) => x.playerId.localeCompare(y.playerId));

    expect(ordersOf(playedA)).toEqual(ordersOf(playedB));
  });

  it('a solo host against three bots reaches round 2 with no human submission after the deadline, and round 3 with exactly one', async () => {
    const room = createTestRoom('FOGWA9');
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // countdown -> startMatch, round 1 bots decided

    // Round 1 -> round 2 via the deadline alone: no human submission at all.
    const round1Deadline = last(host.received, 'CLOCK')!.deadlineAt!;
    vi.setSystemTime(round1Deadline + 1);
    await room.triggerAlarm();
    expect(last(host.received, 'ROUND_RESOLVED')!.view.round).toBe(2);
    expect(room.roomState()!.gameState!.round).toBe(2);

    // Round 2 -> round 3: let the bots release (well before the deadline),
    // then submit exactly one human order to close the round early.
    const round2State = room.roomState()!;
    const round2Start =
      round2State.deadlineAt! - round2State.gameState!.settings.roundTimerSeconds! * 1000;
    vi.setSystemTime(round2Start + 4001); // past botDelayMs's 1500-4000ms ceiling
    await room.triggerAlarm(); // releases round 2's bot submissions; does not close (host hasn't ordered)
    expect(room.roomState()!.gameState!.round).toBe(2);

    // round 2's own view — carried on the ROUND_RESOLVED frame that closed
    // round 1, not the stale round-1 VIEW frame (sendViews is only ever
    // sent once, at match start; every later round's view rides its own
    // ROUND_RESOLVED frame instead).
    const round2View = last(host.received, 'ROUND_RESOLVED')!.view;
    const round2Agent = round2View.self.agents[0]!;
    await host.send({
      type: 'SUBMIT_ORDER',
      round: round2View.round,
      agentId: round2Agent.id,
      actions: [{ type: 'HOLD' }],
    });

    expect(last(host.received, 'ROUND_RESOLVED')!.view.round).toBe(3);
    expect(room.roomState()!.gameState!.round).toBe(3);
  });
});

describe('apps/party/src/bots.ts decideForBotSeats / releaseBotSubmissions (Task 3, unit)', () => {
  /** 1 HUMAN + 3 BOT seats over a real GameState, mirroring
   *  apps/party/tests/clock.test.ts's fixtureRoomState but with BOT seats
   *  filled directly rather than through fillEmptySeatsWithBots — these
   *  tests exercise decideForBotSeats/releaseBotSubmissions in isolation. */
  function fixture(): RoomState {
    const p0: PersonalityId = PERSONALITY_IDS[0]!;
    const p1: PersonalityId = PERSONALITY_IDS[1]!;
    const p2: PersonalityId = PERSONALITY_IDS[2]!;
    const settings: MatchSettings = quickSettings({
      agentsPerPlayer: 1,
      roundTimerSeconds: 90,
      seats: [
        { id: toPlayerId('human-1'), name: 'Vogel', faction: 'BLUE', kind: 'HUMAN', team: null },
        {
          id: toPlayerId('bot-1'),
          name: 'Bot One',
          faction: 'RED',
          kind: 'BOT',
          personality: p0,
          difficulty: BOT_DIFFICULTY,
          team: null,
        },
        {
          id: toPlayerId('bot-2'),
          name: 'Bot Two',
          faction: 'GOLD',
          kind: 'BOT',
          personality: p1,
          difficulty: BOT_DIFFICULTY,
          team: null,
        },
        {
          id: toPlayerId('bot-3'),
          name: 'Bot Three',
          faction: 'GREEN',
          kind: 'BOT',
          personality: p2,
          difficulty: BOT_DIFFICULTY,
          team: null,
        },
      ],
    });
    const gameState = createMatch(settings, 'bots-unit-seed');
    const seats: RoomSeat[] = settings.seats.map((s, i) => ({
      index: i,
      playerId: s.id as unknown as string,
      codename: s.name,
      faction: s.faction,
      kind: s.kind,
      ready: true,
      token: null,
      connectionId: null,
      personality: s.personality ?? null,
      difficulty: s.difficulty ?? null,
    }));
    return {
      code: 'FIXTUR',
      matchId: 'FIXTUR',
      phase: 'IN_GAME',
      hostPlayerId: seats[0]!.playerId!,
      seats,
      startsAt: null,
      gameState,
      deadlineAt: null,
      deadlineRound: null,
      botSubmissions: [],
    };
  }

  it('produces one AgentOrder per live agent of every BOT seat, and none for the HUMAN seat', () => {
    const state = fixture();
    const submissions = decideForBotSeats(
      state,
      1_000_000,
      seedRng('unit-bots'), // real seeded RNG so botDelayMs draws a legal value
      new Map<string, AIAgent>(),
    );

    const submittingPlayerIds = new Set(submissions.map((s) => s.playerId));
    expect(submittingPlayerIds.has('human-1')).toBe(false);
    expect(submittingPlayerIds).toEqual(new Set(['bot-1', 'bot-2', 'bot-3']));
    // agentsPerPlayer: 1 — exactly one order per bot seat.
    expect(submissions).toHaveLength(3);
  });

  it("releases a submission through submitOrder — a rejected order is dropped, never force-applied", () => {
    const state = fixture();
    const liveBotAgent = state.gameState!.players['bot-1']!.agents[0]!;

    // A HOLD from a legitimate bot agent — accepted.
    const goodSubmission = {
      playerId: 'bot-1',
      order: { agentId: liveBotAgent.id, actions: [{ type: 'HOLD' as const }] },
      releaseAt: 0,
    };
    // An order naming an agent id that does not belong to bot-2 at all —
    // the engine answers NOT_YOUR_AGENT, exactly as it would for a human's
    // forged order.
    const badSubmission = {
      playerId: 'bot-2',
      order: { agentId: liveBotAgent.id, actions: [{ type: 'HOLD' as const }] },
      releaseAt: 0,
    };

    const withPending: RoomState = {
      ...state,
      botSubmissions: [goodSubmission, badSubmission],
    };

    const { state: released, released: releasedIds } = releaseBotSubmissions(withPending, 1_000);

    expect(releasedIds).toEqual(['bot-1']);
    expect(released.botSubmissions).toHaveLength(0); // both attempted, one dropped, none requeued
    expect(Object.keys(released.gameState!.pendingOrders)).toContain(liveBotAgent.id as unknown as string);
    // bot-2's forged order never touched pendingOrders under its own agent.
    expect(released.gameState!.players['bot-2']!.agents.every((a) => a.id !== liveBotAgent.id)).toBe(
      true,
    );
  });
});

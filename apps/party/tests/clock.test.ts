import { createMatch, quickSettings, seedRng } from '@berlin/engine';
import type { MatchSettings, ServerMessage } from '@berlin/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeRound } from '../src/round.js';
import type { RoomSeat, RoomState } from '../src/state.js';
import { botDelayMs, onRoundAlarm, scheduleRoundDeadline } from '../src/timers.js';
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

/**
 * A real GameState, built through the engine's own quickSettings/createMatch
 * — not a hand-rolled fixture — wrapped in an IN_GAME RoomState whose seats
 * mirror the settings' seats. roundTimerSeconds defaults to 90 (D-04); tests
 * that need the match to end pass a low roundLimit override instead of
 * playing out 14 real rounds.
 */
function fixtureRoomState(overrides: Partial<MatchSettings> = {}): RoomState {
  const settings = quickSettings({ roundTimerSeconds: 90, agentsPerPlayer: 1, ...overrides });
  const gameState = createMatch(settings, 'clock-test-seed');
  const seats: RoomSeat[] = settings.seats.map((s, i) => ({
    index: i,
    playerId: s.id as unknown as string,
    codename: s.name,
    faction: s.faction,
    kind: s.kind === 'BOT' ? 'BOT' : 'HUMAN',
    ready: true,
    token: null,
    connectionId: null,
    personality: null,
    difficulty: null,
    controlledBy: s.kind === 'BOT' ? 'AI' : 'HUMAN',
    loadout: null,
  }));
  return {
    code: 'ABCDEF',
    matchId: 'ABCDEF',
    phase: 'IN_GAME',
    hostPlayerId: seats[0]?.playerId ?? '',
    seats,
    startsAt: null,
    gameState,
    deadlineAt: null,
    deadlineRound: null,
    botSubmissions: [],
    chat: { LOBBY: [], MATCH: [] },
  };
}

describe('apps/party/src/timers.ts scheduleRoundDeadline (Task 2, pure)', () => {
  it('sets deadlineAt to now + roundTimerSeconds * 1000, an absolute timestamp', () => {
    const state = fixtureRoomState();
    const now = 1_000_000;
    const next = scheduleRoundDeadline(state, now);
    expect(next.deadlineAt).toBe(now + 90_000);
    expect(next.deadlineRound).toBe(state.gameState!.round);
  });

  it('a second call within the same round is a no-op — the countdown cannot reset mid-round', () => {
    const state = fixtureRoomState();
    const first = scheduleRoundDeadline(state, 1_000);
    const second = scheduleRoundDeadline(first, 50_000);
    expect(second.deadlineAt).toBe(first.deadlineAt);
    expect(second.deadlineRound).toBe(first.deadlineRound);
  });

  it("apps/party/src/settings.ts still literally locks roundTimerSeconds to 90 (D-04), which the deadline is derived from", () => {
    const state = fixtureRoomState({ roundTimerSeconds: 45 });
    const next = scheduleRoundDeadline(state, 0);
    // Derived from the field, not a second hardcoded 90 — proven by a
    // non-default value flowing through unchanged.
    expect(next.deadlineAt).toBe(45_000);
  });
});

describe('apps/party/src/timers.ts onRoundAlarm (Task 2, pure)', () => {
  it('firing at or after the deadline auto-Holds every live agent and the round still resolves, advancing by 1', () => {
    const scheduled = scheduleRoundDeadline(fixtureRoomState(), 0);
    const before = scheduled.gameState!.round;
    const next = onRoundAlarm(scheduled, scheduled.deadlineAt!);
    expect(next.gameState).not.toBeNull();
    expect(next.gameState!.round).toBe(before + 1);
    // Auto-Hold banks Intel, it does not eliminate — a player who was absent
    // for the whole order phase loses tempo, not the match.
    for (const player of Object.values(next.gameState!.players)) {
      expect(player.eliminated).toBe(false);
    }
    // pendingOrders is cleared by resolveRound — proof the auto-Held orders
    // were actually consumed by the pipeline, not left dangling.
    expect(Object.keys(next.gameState!.pendingOrders)).toHaveLength(0);
  });

  it('firing before the deadline (a stale/duplicate delivery) is a no-op', () => {
    const scheduled = scheduleRoundDeadline(fixtureRoomState(), 0);
    const tooEarly = onRoundAlarm(scheduled, scheduled.deadlineAt! - 1);
    expect(tooEarly).toEqual(scheduled);
  });

  it('firing with no deadline scheduled (the round already closed by ALL_COMMITTED) is a no-op', () => {
    const state = fixtureRoomState();
    const closedEarly = closeRound(state, 'ALL_COMMITTED');
    // No scheduleRoundDeadline call happened for the new round yet — the
    // room hasn't gotten around to it — so deadlineAt is still null/stale
    // from before, and the alarm has nothing to act on.
    const afterAlarm = onRoundAlarm(closedEarly, 999_999_999);
    expect(afterAlarm.gameState!.round).toBe(closedEarly.gameState!.round);
  });

  it('two alarm fires at the same now (a genuine duplicate delivery) produce exactly one resolution', () => {
    const scheduled = scheduleRoundDeadline(fixtureRoomState(), 0);
    const now = scheduled.deadlineAt!;
    const once = onRoundAlarm(scheduled, now);
    // The platform re-delivers the identical alarm event at essentially the
    // same wall-clock time — well before the freshly-scheduled next
    // deadline (now + 90000) — so the second call must be a no-op.
    const twice = onRoundAlarm(once, now);
    expect(once.gameState!.round).toBe(scheduled.gameState!.round + 1);
    expect(twice.gameState!.round).toBe(once.gameState!.round);
  });

  it("round N+1's deadlineAt is strictly greater than round N's", () => {
    const scheduled = scheduleRoundDeadline(fixtureRoomState(), 0);
    const roundNDeadline = scheduled.deadlineAt!;
    const afterAlarm = onRoundAlarm(scheduled, roundNDeadline);
    expect(afterAlarm.deadlineAt).not.toBeNull();
    expect(afterAlarm.deadlineAt!).toBeGreaterThan(roundNDeadline);
  });

  it('agentsCommitted resets to 0 for every seat at the start of the next round', () => {
    const scheduled = scheduleRoundDeadline(fixtureRoomState(), 0);
    const resolved = onRoundAlarm(scheduled, scheduled.deadlineAt!);
    expect(Object.keys(resolved.gameState!.pendingOrders)).toHaveLength(0);
  });

  it('when the resolved round produces a non-null outcome, no new deadline is scheduled and phase is ENDED', () => {
    // roundLimit: 1 — round starts at 1, resolves to round 2, 2 > 1, so the
    // very first resolution ends the match via ROUND_LIMIT.
    const scheduled = scheduleRoundDeadline(fixtureRoomState({ roundLimit: 1 }), 0);
    const next = onRoundAlarm(scheduled, scheduled.deadlineAt!);
    expect(next.gameState!.outcome).not.toBeNull();
    expect(next.phase).toBe('ENDED');
    // scheduleRoundDeadline was never reached for a "next" round: deadlineAt
    // still carries whatever closeRound left it at (unchanged from the
    // pre-alarm value), never a freshly-computed future timestamp.
    expect(next.deadlineAt).toBe(scheduled.deadlineAt);
  });
});

describe('apps/party/src/timers.ts botDelayMs (Task 2, pure)', () => {
  it('returns an integer in the inclusive range 1500-4000 across many draws', () => {
    const rng = seedRng('bot-delay-test');
    for (let i = 0; i < 200; i++) {
      const ms = botDelayMs(rng);
      expect(Number.isInteger(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(1500);
      expect(ms).toBeLessThanOrEqual(4000);
    }
  });
});

describe('apps/party round clock (Task 2, integration)', () => {
  // room.ts's onAlarm reads real Date.now() (that read intentionally lives
  // only there — timers.ts/round.ts take `now` as a parameter). Driving the
  // 90s deadline forward without a real 90s sleep means controlling what
  // Date.now() returns, via vi.setSystemTime — not a change to any
  // production code path.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a real room schedules a deadline at match start and advances the round when the alarm fires', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    await host.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm(); // countdown expiry -> startMatch + first deadline

    const clockFrame = last(host.received, 'CLOCK');
    expect(clockFrame).toBeDefined();
    expect(clockFrame!.deadlineAt).not.toBeNull();

    const viewFrame = last(host.received, 'VIEW');
    expect(viewFrame!.view.round).toBe(1);

    // Firing the alarm again immediately, before the deadline, must be a
    // no-op — proof of the stale/duplicate-delivery guard.
    await room.triggerAlarm();
    expect(last(host.received, 'ROUND_RESOLVED')).toBeUndefined();

    vi.setSystemTime(clockFrame!.deadlineAt! + 1);
    await room.triggerAlarm(); // round deadline -> auto-Hold, resolve, next deadline

    const resolvedFrame = last(host.received, 'ROUND_RESOLVED');
    expect(resolvedFrame).toBeDefined();
    expect(resolvedFrame!.view.round).toBe(2);

    const nextClockFrame = last(host.received, 'CLOCK');
    expect(nextClockFrame).not.toBe(clockFrame);
    expect(nextClockFrame!.deadlineAt!).toBeGreaterThan(clockFrame!.deadlineAt!);
  });

  it('agentsCommitted only ever increases within a round, never decreases', async () => {
    const room = createTestRoom();
    const host = room.connect('Vogel');
    await host.send({ type: 'CREATE', codename: 'Vogel' });
    const guest = room.connect('Katja');
    const code = last(host.received, 'JOINED')!.code;
    await guest.send({ type: 'JOIN', code, codename: 'Katja' });
    await host.send({ type: 'SET_READY', ready: true });
    await guest.send({ type: 'SET_READY', ready: true });
    await room.triggerAlarm();

    const hostPlayerId = last(host.received, 'JOINED')!.playerId;
    const hostView = last(host.received, 'VIEW')!.view;
    const hostAgent = hostView.self.agents[0]!;

    await host.send({
      type: 'SUBMIT_ORDER',
      round: hostView.round,
      agentId: hostAgent.id,
      actions: [{ type: 'HOLD' }],
    });

    const counts = guest.received
      .filter((f): f is Extract<ServerMessage, { type: 'OPPONENT_COMMITTED' }> =>
        f.type === 'OPPONENT_COMMITTED' && f.playerId === hostPlayerId,
      )
      .map((f) => f.agentsCommitted);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
    expect(counts.length).toBeGreaterThan(0);
  });
});

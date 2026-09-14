import { describe, expect, it } from 'vitest';
import { createMatch, projectView, quickSettings, resolveRound, submitOrder, seedRng } from '../src/index.js';
import { randomActions } from './helpers.js';
import { Scenario, hold, strike } from './scenario.js';
import type { GameState, PlayerId, PlayerView, ResolutionEvent } from '@berlin/shared';

/**
 * MATCH-06 / D-01: GameState.history and PlayerView.history — a per-player,
 * already fog-filtered, round log retained across the whole match, computed
 * once at the instant each round resolves (RESEARCH.md Pitfall 1/2). This
 * file proves the persisted-history correctness; the multi-round audibility
 * stability regression that pins the "filtered once, never re-filtered"
 * invariant lives in Task 2's extension of this same file.
 */

/** Drive `rounds` real rounds with random legal moves, returning the final state. */
function advance(state: GameState, seed: string, rounds: number): GameState {
  const rng = seedRng(seed);
  let cur = state;
  for (let r = 0; r < rounds && cur.phase === 'ORDERS'; r++) {
    for (const pid of cur.playerOrder) {
      const p = cur.players[pid as string]!;
      if (p.eliminated) continue;
      for (const agent of p.agents) {
        if (!agent.alive) continue;
        cur = submitOrder(cur, pid, randomActions(cur, pid, agent.id as string, rng)).state;
      }
    }
    cur = resolveRound(cur).state;
  }
  return cur;
}

describe('GameState.history / PlayerView.history — persisted round log (D-01)', () => {
  it('is an empty array for every seat immediately after createMatch, before any round resolves', () => {
    const state = createMatch(quickSettings(), 'history-empty');
    for (const pid of state.playerOrder) {
      const view = projectView(state, pid);
      expect(view.history).toEqual([]);
    }
  });

  it('has exactly N entries for every player after N resolved rounds', () => {
    const N = 5;
    const state = advance(createMatch(quickSettings(), 'history-count'), 'history-count', N);
    for (const pid of state.playerOrder) {
      const view = projectView(state, pid);
      expect(view.history).toHaveLength(N);
    }
  });

  it('the newest history entry deep-equals lastRound for the same viewer', () => {
    const N = 4;
    const state = advance(createMatch(quickSettings(), 'history-newest'), 'history-newest', N);
    for (const pid of state.playerOrder) {
      const view: PlayerView = projectView(state, pid);
      expect(view.history[N - 1]).toEqual(view.lastRound);
    }
  });

  it('every stored round begins with a ROUND_START event whose round is i + 1', () => {
    const N = 6;
    const state = advance(createMatch(quickSettings(), 'history-roundstart'), 'history-roundstart', N);
    for (const pid of state.playerOrder) {
      const view = projectView(state, pid);
      for (let i = 0; i < view.history.length; i++) {
        const round = view.history[i]!;
        expect(round[0]?.type).toBe('ROUND_START');
        expect(round[0]).toMatchObject({ type: 'ROUND_START', round: i + 1 });
      }
    }
  });

  it('two different viewers of the same resolved match can have different history[i] contents', () => {
    const N = 6;
    const state = advance(createMatch(quickSettings(), 'history-perplayer'), 'history-perplayer', N);
    const [p1, p2] = state.playerOrder as [PlayerId, PlayerId];
    const view1 = projectView(state, p1);
    const view2 = projectView(state, p2);

    // At least one round in a 6-round randomized duel should differ between
    // the two fog-filtered viewers (private events like AGENT_MOVED are
    // never shared). If this ever becomes flaky across CI runs, the fixture
    // seed should be swapped for one confirmed to produce a difference.
    let sawDifference = false;
    for (let i = 0; i < N; i++) {
      if (JSON.stringify(view1.history[i]) !== JSON.stringify(view2.history[i])) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });
});

/**
 * Task 2: pin the "filtered once, at resolution, never re-filtered" invariant
 * (RESEARCH.md Pitfall 1/2) with a direct regression, rather than trusting
 * that Task 1's implementation happens to hold. This is the assertion that
 * actually fails if a later change ever moves the reduction back to read time.
 */
describe('history stability — the audibility-mis-grading regression (RESEARCH.md Pitfall 1/2)', () => {
  it('a stored round is frozen the instant it is stored — a later change in the viewer\'s own position does not retroactively upgrade an old STRIKE_FIRED entry', () => {
    // Round 1: p1 strikes alexanderplatz from friedrichstrasse. p2's single
    // agent starts far away at kurfurstendamm — VICINITY grade, not EXACT —
    // so filterEvents drops the STRIKE_FIRED event from p2's round-1 entry
    // entirely (packages/engine/src/fog/filterEvents.ts's STRIKE_FIRED branch).
    const s = new Scenario('hist-stability')
      .at(1, 'friedrichstrasse')
      .at(2, 'kurfurstendamm')
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    let state = resolveRound(s.state).state;
    const p2 = 'p2' as PlayerId;

    const entry0 = projectView(state, p2).history[0];
    expect(entry0).toBeDefined();
    expect(entry0!.some((e) => e.type === 'STRIKE_FIRED')).toBe(false);

    // Round 2: teleport p2's agent to checkpoint_charlie — adjacent to
    // alexanderplatz, the round-1 strike's target — and resolve. If the
    // defective (re-filter-on-read) design were still in place, the viewer
    // would now be "nearby" and a fresh filterEvents(state, round1Log, p2)
    // call would upgrade round 1's entry to EXACT. The correct design never
    // makes that call again; the stored entry was frozen at round 1.
    state.players['p2']!.agents[0]!.nodeId = 'checkpoint_charlie' as never;
    state.pendingOrders = {
      'p1:a1': { agentId: 'p1:a1' as never, actions: [hold(), hold()] },
      'p2:a1': { agentId: 'p2:a1' as never, actions: [hold(), hold()] },
    };
    state = resolveRound(state).state;

    // Round 3: move p2 back away again, for good measure.
    state.players['p2']!.agents[0]!.nodeId = 'kurfurstendamm' as never;
    state.pendingOrders = {
      'p1:a1': { agentId: 'p1:a1' as never, actions: [hold(), hold()] },
      'p2:a1': { agentId: 'p2:a1' as never, actions: [hold(), hold()] },
    };
    state = resolveRound(state).state;

    const entry0After = projectView(state, p2).history[0];
    expect(entry0After).toEqual(entry0);
    expect(entry0After!.some((e) => e.type === 'STRIKE_FIRED')).toBe(false);
  });

  it('history[i] equals the live lastRound captured at the end of round i + 1 — never a value recomputed at the end', () => {
    const N = 6;
    let state = createMatch(quickSettings(), 'hist-live-capture');
    const rng = seedRng('hist-live-capture');
    // Captured DURING the drive loop — comparing against a value recomputed
    // at the end would pass even under the defective design, which is
    // precisely the trap this test exists to avoid.
    const liveLastRoundByPlayer: Record<string, Array<readonly ResolutionEvent[]>> = {};
    for (const pid of state.playerOrder) liveLastRoundByPlayer[pid as string] = [];

    for (let r = 0; r < N && state.phase === 'ORDERS'; r++) {
      for (const pid of state.playerOrder) {
        const p = state.players[pid as string]!;
        if (p.eliminated) continue;
        for (const agent of p.agents) {
          if (!agent.alive) continue;
          state = submitOrder(state, pid, randomActions(state, pid, agent.id as string, rng)).state;
        }
      }
      state = resolveRound(state).state;
      for (const pid of state.playerOrder) {
        liveLastRoundByPlayer[pid as string]!.push(projectView(state, pid).lastRound);
      }
    }

    for (const pid of state.playerOrder) {
      const finalHistory = projectView(state, pid).history;
      const live = liveLastRoundByPlayer[pid as string]!;
      expect(finalHistory).toHaveLength(live.length);
      for (let i = 0; i < live.length; i++) {
        expect(finalHistory[i]).toEqual(live[i]);
      }
    }
  });

  it('no cross-viewer bleed — a viewer\'s serialized history never contains another player\'s agent id', () => {
    const rng = seedRng('hist-no-bleed');
    let state = createMatch(quickSettings(), 'hist-no-bleed');
    for (let r = 0; r < 6 && state.phase === 'ORDERS'; r++) {
      for (const pid of state.playerOrder) {
        const p = state.players[pid as string]!;
        if (p.eliminated) continue;
        for (const agent of p.agents) {
          if (!agent.alive) continue;
          state = submitOrder(state, pid, randomActions(state, pid, agent.id as string, rng)).state;
        }
      }
      state = resolveRound(state).state;

      for (const viewer of state.playerOrder) {
        const historyJson = JSON.stringify(projectView(state, viewer).history);
        for (const other of state.playerOrder) {
          if (other === viewer) continue;
          const opp = state.players[other as string]!;
          for (const a of opp.agents) {
            expect(historyJson, `agent ${a.id} leaked into ${viewer}'s history`).not.toContain(
              a.id as string,
            );
          }
        }
      }
    }
  });
});

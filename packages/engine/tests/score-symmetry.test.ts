import { describe, expect, it } from 'vitest';
import { createMatch, projectView, quickSettings, resolveRound, scoreOf, submitOrder, seedRng } from '../src/index.js';
import { randomActions } from './helpers.js';
import type { GameState } from '@berlin/shared';

/**
 * 01-06-PLAN.md's deliberate exception to "no engine changes this phase":
 * `SelfView.score` closes the one asymmetry left in the fog boundary —
 * `OpponentPublicInfo.score` already exists, so without this field a player
 * is the only participant in the match who cannot see their own standing.
 * This file, not fog-leak.test.ts, is where that claim is proven, because
 * fog-leak.test.ts proves what must stay hidden and this proves what must
 * now be shown — and shown identically to what every opponent already sees.
 */

function advance(state: GameState, seed: string, rounds: number): GameState[] {
  const rng = seedRng(seed);
  const snapshots: GameState[] = [state];
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
    snapshots.push(cur);
  }
  return snapshots;
}

const SEEDS = ['score-sym-1', 'score-sym-2', 'score-sym-3'];

// The literal OpponentPublicInfo key set (packages/shared/src/view.ts) — a
// shape assertion proving this plan's SelfView addition did not also widen
// the opponent-facing surface. score already belonged to this set before
// this plan; the point is that the set is unchanged, not that score is new
// here too.
const OPPONENT_PUBLIC_INFO_KEYS = [
  'id',
  'name',
  'faction',
  'team',
  'isBot',
  'intel',
  'agentsAlive',
  'agentsTotal',
  'score',
  'eliminated',
  'committedAgents',
].sort();

describe('SelfView.score', () => {
  it('equals scoreOf(state, viewer) for every player in every state', () => {
    for (const seed of SEEDS) {
      const snapshots = advance(createMatch(quickSettings(), seed), seed, 5);
      for (const state of snapshots) {
        for (const viewer of state.playerOrder) {
          const view = projectView(state, viewer);
          expect(view.self.score).toBe(scoreOf(state, viewer));
        }
      }
    }
  });

  it("shows a player exactly the score every opponent already sees for them — never a figure a rival can see that the player can't, and never one denied", () => {
    for (const seed of SEEDS) {
      const snapshots = advance(createMatch(quickSettings(), seed), seed, 5);
      for (const state of snapshots) {
        for (const a of state.playerOrder) {
          const viewA = projectView(state, a);
          for (const b of state.playerOrder) {
            if (a === b) continue;
            const viewB = projectView(state, b);
            const bsRecordOfA = viewB.opponents.find((o) => o.id === a);
            expect(bsRecordOfA, `${b} has no opponent record for ${a}`).toBeDefined();
            expect(viewA.self.score, `A's own score vs. what B sees for A, round ${state.round}`).toBe(
              bsRecordOfA!.score,
            );
          }
        }
      }
    }
  });

  it('does not widen OpponentPublicInfo — the projected opponent key set is unchanged', () => {
    const state = advance(createMatch(quickSettings(), 'score-sym-shape'), 'score-sym-shape', 3).pop()!;
    for (const viewer of state.playerOrder) {
      const view = projectView(state, viewer);
      for (const opp of view.opponents) {
        expect(Object.keys(opp).sort()).toEqual(OPPONENT_PUBLIC_INFO_KEYS);
      }
    }
  });
});

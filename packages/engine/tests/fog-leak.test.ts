import { describe, expect, it } from 'vitest';
import { createMatch, projectView, quickSettings, resolveRound, submitOrder, seedRng } from '../src/index.js';
import { randomActions } from './helpers.js';
import type { GameState, PlayerId } from '@berlin/shared';

/**
 * THE most important test in the repo.
 *
 * Four categories of hidden state, and only the first is obvious:
 *   1. agent positions
 *   2. the safehouse   (permanent, and the tiebreak for every contested node)
 *   3. active traps
 *   4. cooldown timers
 *
 * A leaked safehouse is arguably worse than a leaked position — positions
 * change every round, safehouses don't.
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

describe('fog of war', () => {
  it('never serializes an opponent agent, trap, or decoy id', () => {
    for (let s = 0; s < 25; s++) {
      const snapshots = advance(createMatch(quickSettings(), `leak-${s}`), `leak-${s}`, 6);

      for (const state of snapshots) {
        for (const viewer of state.playerOrder) {
          const json = JSON.stringify(projectView(state, viewer));

          for (const other of state.playerOrder) {
            if (other === viewer) continue;
            const opp = state.players[other as string]!;

            for (const a of opp.agents) {
              expect(json, `agent ${a.id} leaked to ${viewer}`).not.toContain(a.id as string);
            }
          }

          for (const t of state.traps) {
            if (t.ownerId === viewer) continue;
            expect(json, `trap ${t.id} leaked to ${viewer}`).not.toContain(t.id);
          }
          for (const d of state.decoys) {
            if (d.ownerId === viewer) continue;
            expect(json, `decoy ${d.id} leaked to ${viewer}`).not.toContain(d.id);
          }
        }
      }
    }
  });

  it('OpponentPublicInfo has no field that could hold hidden state', () => {
    const state = advance(createMatch(quickSettings(), 'shape'), 'shape', 3).pop()!;
    const view = projectView(state, state.playerOrder[0]!);

    for (const opp of view.opponents) {
      const keys = Object.keys(opp);
      for (const forbidden of [
        'agents',
        'safehouse',
        'traps',
        'decoys',
        'cooldowns',
        'loadout',
        'passivesAvailable',
        'nodeId',
      ]) {
        expect(keys, `opponent info exposes ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('only reveals nodes the viewer has earned', () => {
    const state = advance(createMatch(quickSettings(), 'vis'), 'vis', 4).pop()!;

    for (const viewer of state.playerOrder) {
      const view = projectView(state, viewer);
      const me = state.players[viewer as string]!;

      const earned = new Set<string>();
      for (const a of me.agents) {
        if (!a.alive) continue;
        earned.add(a.nodeId as string);
        const n = state.map.nodes.find((x) => x.id === a.nodeId)!;
        for (const e of n.edges) earned.add(e.to as string);
      }
      for (const [key, n] of Object.entries(state.nodes)) {
        if (n.informantOwner === viewer) earned.add(key);
      }

      for (const key of Object.keys(view.visibleNodes)) {
        expect(earned, `node ${key} visible without entitlement`).toContain(key);
      }
    }
  });

  it('gives every player the same view of every burn track, including their own', () => {
    const state = advance(createMatch(quickSettings(), 'burn'), 'burn', 5).pop()!;
    const views = state.playerOrder.map((p) => projectView(state, p));

    for (const owner of state.playerOrder) {
      const rendered = views.map((v) => JSON.stringify(v.burnTracks[owner as string]));
      expect(new Set(rendered).size, 'burn tracks differ between viewers').toBe(1);
    }
    // And the owner sees their own track at all — the "what they know about me" panel.
    expect(views[0]!.burnTracks[state.playerOrder[0]! as string]).toBeDefined();
  });

  it('withholds the blockade schedule from players without Kontrolle Schedule', () => {
    const state = createMatch(quickSettings(), 'kontrolle');
    for (const viewer of state.playerOrder) {
      const me = state.players[viewer as string]!;
      const view = projectView(state, viewer);
      const holdsIt = me.loadout.some((c) => (c as string) === 'ps_kontrolle');
      if (holdsIt) expect(view.self.knownBlockades.length).toBeGreaterThanOrEqual(0);
      else expect(view.self.knownBlockades).toHaveLength(0);
    }
  });
});

describe('projectView', () => {
  it('throws for an unknown player rather than returning a partial view', () => {
    const state = createMatch(quickSettings(), 'unknown');
    expect(() => projectView(state, 'nobody' as PlayerId)).toThrow();
  });
});

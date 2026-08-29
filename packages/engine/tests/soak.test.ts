import { describe, expect, it } from 'vitest';
import { quickSettings, projectView } from '../src/index.js';
import { playRandomMatch } from './helpers.js';
import { playerId, type MatchSettings } from '@berlin/shared';

/**
 * Phase 1's exit criterion: 1000 complete matches at both 1 and 2 agents, no
 * crashes, no leaks, no hangs. Random agents are a fuzzer, not an opponent —
 * they explore states a real player never would, which is the point.
 */

const ffa4 = (agentsPerPlayer: 1 | 2): MatchSettings =>
  quickSettings({
    agentsPerPlayer,
    seats: [
      { id: playerId('p1'), name: 'CIA', faction: 'BLUE', kind: 'HUMAN', team: null },
      { id: playerId('p2'), name: 'Stasi', faction: 'RED', kind: 'HUMAN', team: null },
      { id: playerId('p3'), name: 'Corps', faction: 'GOLD', kind: 'HUMAN', team: null },
      { id: playerId('p4'), name: 'Runners', faction: 'GREEN', kind: 'HUMAN', team: null },
    ],
  });

describe('soak', () => {
  for (const agents of [1, 2] as const) {
    it(`completes 500 duel matches with ${agents} agent(s) each`, () => {
      const settings = quickSettings({ agentsPerPlayer: agents });
      const reasons = new Map<string, number>();

      for (let i = 0; i < 500; i++) {
        const { final } = playRandomMatch(`soak-${agents}-${i}`, settings);

        expect(final.phase, `match ${i} never finished`).toBe('FINISHED');
        expect(final.outcome, `match ${i} ended with no outcome`).not.toBeNull();

        const reason = final.outcome!.reason;
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);

        // No orphaned state from a dead player.
        for (const pid of final.playerOrder) {
          const p = final.players[pid as string]!;
          if (!p.eliminated) continue;
          expect(p.safehouse, 'eliminated player kept a safehouse').toBeNull();
          expect(final.traps.some((t) => t.ownerId === pid)).toBe(false);
          expect(final.decoys.some((d) => d.ownerId === pid)).toBe(false);
          expect(
            Object.values(final.nodes).some((n) => n.informantOwner === pid),
            'eliminated player kept an informant',
          ).toBe(false);
        }
      }

      // Every match ends. No draws, no infinite stalemates.
      expect([...reasons.values()].reduce((a, b) => a + b, 0)).toBe(500);
    });
  }

  it('completes 200 four-player matches at both agent counts', () => {
    for (const agents of [1, 2] as const) {
      for (let i = 0; i < 100; i++) {
        const { final } = playRandomMatch(`ffa-${agents}-${i}`, ffa4(agents));
        expect(final.phase).toBe('FINISHED');
        expect(final.outcome).not.toBeNull();
      }
    }
  });

  it('projects a view for every player at every round without throwing', () => {
    for (let i = 0; i < 50; i++) {
      const { final } = playRandomMatch(`view-${i}`, ffa4(2));
      for (const pid of final.playerOrder) {
        expect(() => projectView(final, pid)).not.toThrow();
      }
    }
  });

  it('never lets Intel go negative or exceed the cap', () => {
    for (let i = 0; i < 100; i++) {
      const { final } = playRandomMatch(`intel-${i}`, ffa4(2));
      for (const pid of final.playerOrder) {
        const p = final.players[pid as string]!;
        expect(p.intel, `${pid} has negative Intel`).toBeGreaterThanOrEqual(0);
        expect(p.intel).toBeLessThanOrEqual(final.ruleset.intelCap);
      }
    }
  });
});

/**
 * Not a pass/fail gate — a readout. These are the numbers the sim harness in
 * packages/ai will interrogate properly once real bots exist. Random agents
 * exaggerate everything, so treat this as a smoke signal rather than balance
 * data: it only has to show that matches are ending for varied reasons.
 */
describe('shape of a match (random agents — indicative only)', () => {
  it('reports outcome mix and length', () => {
    const reasons = new Map<string, number>();
    let totalRounds = 0;
    const n = 300;

    for (let i = 0; i < n; i++) {
      const { final } = playRandomMatch(`shape-${i}`, quickSettings({ agentsPerPlayer: 2 }));
      reasons.set(final.outcome!.reason, (reasons.get(final.outcome!.reason) ?? 0) + 1);
      totalRounds += final.round;
    }

    const avg = totalRounds / n;
    // eslint-disable-next-line no-console
    console.log(
      `\n  random-agent duel: avg ${avg.toFixed(1)} rounds — ` +
        [...reasons].map(([k, v]) => `${k} ${((v / n) * 100).toFixed(0)}%`).join(', '),
    );

    expect(avg).toBeGreaterThan(1);
    expect(reasons.size, 'every match ending the same way suggests a stuck rule').toBeGreaterThan(1);
  });
});

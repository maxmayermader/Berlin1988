import { describe, expect, it } from 'vitest';
import type { Difficulty, PersonalityId } from '@berlin/shared';
import { runMatch, type SeatSpec } from '../sim/match.js';
import { aggregate, actionProfile, percentile, profileDistance, winRate } from '../sim/report.js';
import { createAgent, PERSONALITY_IDS, TIERS } from '../src/index.js';
import {
  autoHoldMissing,
  createMatch,
  legalOrders,
  quickSettings,
  resolveRound,
  viewForOrdering,
} from '@berlin/engine';

/**
 * The gates from docs/AI_OPPONENTS.md §5.
 *
 * A personality that doesn't play measurably differently is flavour text, and a
 * difficulty tier that doesn't actually play better is a lie. These are the
 * tests that stop either from shipping.
 */

function sweep(
  seeds: number,
  seats: readonly SeatSpec[],
  overrides: Parameters<typeof runMatch>[2] = {},
) {
  const results = [];
  for (let i = 0; i < seeds; i++) {
    results.push(runMatch(`val-${seats.map((s) => s.personality).join()}-${i}`, seats, overrides));
  }
  return aggregate(results);
}

describe('distinguishability', () => {
  /**
   * Each personality's action histogram must be separable from the others. If
   * two personalities are statistically indistinguishable, one is redundant.
   */
  it('every pair of personalities plays measurably differently', () => {
    const profiles = new Map<PersonalityId, Record<string, number>>();

    for (const p of PERSONALITY_IDS) {
      // Mirror match, so the only variable is the personality itself.
      const agg = sweep(40, [
        { personality: p, difficulty: 'HANDLER' },
        { personality: p, difficulty: 'HANDLER' },
      ]);
      const seat = [...agg.bySeatKey.values()][0]!;
      profiles.set(p, actionProfile(seat));
    }

    const failures: string[] = [];
    for (let i = 0; i < PERSONALITY_IDS.length; i++) {
      for (let j = i + 1; j < PERSONALITY_IDS.length; j++) {
        const a = PERSONALITY_IDS[i]!;
        const b = PERSONALITY_IDS[j]!;
        const d = profileDistance(profiles.get(a)!, profiles.get(b)!);
        // L1 distance over a 9-bin histogram. 0.15 is a low bar deliberately —
        // it catches "these two are the same bot", not fine distinctions.
        if (d < 0.15) failures.push(`${a} vs ${b}: ${d.toFixed(3)}`);
      }
    }

    expect(failures, `indistinguishable personalities: ${failures.join('; ')}`).toEqual([]);
  });

  it('gives each personality the signature its documentation claims', () => {
    const profileOf = (p: PersonalityId) => {
      const agg = sweep(40, [
        { personality: p, difficulty: 'HANDLER' },
        { personality: p, difficulty: 'HANDLER' },
      ]);
      return actionProfile([...agg.bySeatKey.values()][0]!);
    };

    const katja = profileOf('KATJA');
    const halloran = profileOf('HALLORAN');
    const marek = profileOf('MAREK');

    // "She never fights" — the documented tell must actually hold.
    expect(katja.STRIKE ?? 0, 'Katja is supposed to never strike').toBe(0);
    expect(katja.AMBUSH ?? 0, 'Katja is supposed to never trap').toBe(0);

    // "Territorial and static" vs. Marek's constant motion.
    const hallMove = (halloran.MOVE ?? 0) + (halloran.SPRINT ?? 0);
    const marekMove = (marek.MOVE ?? 0) + (marek.SPRINT ?? 0);
    expect(hallMove, 'the Spider should move far less than the Butcher').toBeLessThan(marekMove);

    // "Leans on Mode B" — Halloran traps more than Marek does.
    expect(halloran.AMBUSH ?? 0).toBeGreaterThan(marek.AMBUSH ?? 0);
  });
});

describe('difficulty', () => {
  /**
   * Monotonicity: each tier must beat the one below it head to head. Difficulty
   * is implemented as degraded inference, so if this fails the tiers are noise
   * rather than skill.
   */
  it('each tier beats the one below it, head to head', () => {
    const ladder: Difficulty[] = ['RECRUIT', 'FIELD_AGENT', 'HANDLER', 'SPYMASTER'];
    const failures: string[] = [];

    for (let i = 0; i < ladder.length - 1; i++) {
      const weak = ladder[i]!;
      const strong = ladder[i + 1]!;

      let strongWins = 0;
      let decided = 0;

      // Both seats run the same personality so difficulty is the only variable,
      // and seats are swapped each iteration to cancel any seat-order edge.
      for (let n = 0; n < 60; n++) {
        const seats: SeatSpec[] =
          n % 2 === 0
            ? [
                { personality: 'SABLE', difficulty: weak },
                { personality: 'SABLE', difficulty: strong },
              ]
            : [
                { personality: 'SABLE', difficulty: strong },
                { personality: 'SABLE', difficulty: weak },
              ];

        const r = runMatch(`ladder-${weak}-${strong}-${n}`, seats);
        const winners = new Set(r.winners);
        const strongSeat = r.perSeat.find((s) => s.difficulty === strong)!;
        const weakSeat = r.perSeat.find((s) => s.difficulty === weak)!;
        if (winners.has(strongSeat.id) === winners.has(weakSeat.id)) continue;
        decided++;
        if (winners.has(strongSeat.id)) strongWins++;
      }

      const rate = decided ? strongWins / decided : 0.5;
      if (rate < 0.5) failures.push(`${strong} beat ${weak} only ${(rate * 100).toFixed(0)}%`);
    }

    expect(failures, failures.join('; ')).toEqual([]);
  });

  it('degrades inference, not information — noise and temperature fall with tier', () => {
    // Guards against someone "fixing" a weak tier by handing it more data.
    const ladder: Difficulty[] = ['RECRUIT', 'FIELD_AGENT', 'HANDLER', 'SPYMASTER'];
    for (let i = 0; i < ladder.length - 1; i++) {
      const lo = TIERS[ladder[i]!];
      const hi = TIERS[ladder[i + 1]!];
      expect(hi.beliefNoise).toBeLessThanOrEqual(lo.beliefNoise);
      expect(hi.temperature).toBeLessThanOrEqual(lo.temperature);
      expect(hi.blunderRate).toBeLessThanOrEqual(lo.blunderRate);
    }
  });
});

describe('speed', () => {
  it('decides in under 50ms at p99, at the hardest tier with two agents', () => {
    const real = sweep(40, [
      { personality: 'SABLE', difficulty: 'SPYMASTER' },
      { personality: 'HALLORAN', difficulty: 'SPYMASTER' },
    ]);

    for (const seat of real.bySeatKey.values()) {
      const p99 = percentile(seat.decisionMs, 99);
      expect(p99, `${seat.key} p99 was ${p99.toFixed(2)}ms`).toBeLessThan(50);
    }
  });
});

describe('self-preservation', () => {
  /**
   * Agents never respawn, so walking into an announced blockade is BROKEN, not
   * easy. This is a floor at Field Agent and above, not a personality trait.
   */
  it('never moves into a node it has been told will be sealed', () => {
    // Tested at the DECISION level, not via outcomes. Blockade deaths over a
    // whole match are confounded: a Handler plays more ambitiously, survives
    // longer, and is therefore alive for more late-game blockades than a
    // Recruit that already died to something else. What the claim actually says
    // is "does not walk into a node it knows is closing", and that is checkable
    // directly.
    let offered = 0;
    let taken = 0;

    for (const p of PERSONALITY_IDS) {
      for (let n = 0; n < 25; n++) {
        const state = createMatch(
          quickSettings({ blockadeMode: 'ANNOUNCED', agentsPerPlayer: 1 }),
          `decide-${p}-${n}`,
        );
        // Fast-forward to a round where something has been announced.
        let cur = state;
        for (let r = 0; r < 8 && cur.phase === 'ORDERS'; r++) {
          const pid = cur.playerOrder[0]!;
          const view = viewForOrdering(cur, pid, `${pid}:a1`);
          const agentId = view.self.agents[0]!.id;
          if (!view.self.agents[0]!.alive) break;

          const doomed = new Set(view.announcedBlockades.map((b) => b.nodeId as string));
          if (doomed.size > 0) {
            const reachable = legalOrders(view, agentId).filter(
              (a) => a.type === 'MOVE' && doomed.has(a.to as string),
            );
            if (reachable.length > 0) {
              offered++;
              const chosen = createAgent(p, 'HANDLER', `d-${n}`).decide(view, agentId);
              if (chosen.some((a) => a.type === 'MOVE' && doomed.has(a.to as string))) {
                taken++;
              }
            }
          }
          cur = autoHoldMissing(cur);
          cur = resolveRound(cur).state;
        }
      }
    }

    expect(offered, 'the scenario never arose — the test proves nothing').toBeGreaterThan(0);
    expect(taken, `Handlers walked into ${taken} of ${offered} announced blockades`).toBe(0);
  });
});

describe('field is not degenerate', () => {
  it('no personality wins more than 80% of a mixed four-player field', () => {
    const seats: SeatSpec[] = [
      { personality: 'KATJA', difficulty: 'HANDLER' },
      { personality: 'MAREK', difficulty: 'HANDLER' },
      { personality: 'HALLORAN', difficulty: 'HANDLER' },
      { personality: 'VOGEL', difficulty: 'HANDLER' },
    ];
    const agg = sweep(60, seats);

    for (const seat of agg.bySeatKey.values()) {
      expect(
        winRate(seat),
        `${seat.key} wins ${(winRate(seat) * 100).toFixed(0)}% of a four-way field`,
      ).toBeLessThan(0.8);
    }
  });
});

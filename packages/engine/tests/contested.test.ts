import { describe, expect, it } from 'vitest';
import { resolveRound, projectView, legalOrders, submitOrder, viewForOrdering } from '../src/index.js';
import { Scenario, ambush, hold, move, strike } from './scenario.js';
import type { ContestMethod, ResolutionEvent } from '@berlin/shared';

const alive = (s: ReturnType<typeof resolveRound>['state'], p: string, i = 1) =>
  s.players[p]!.agents[i - 1]!.alive;

const contestOf = (log: ResolutionEvent[]): Extract<ResolutionEvent, { type: 'CONTEST' }> | undefined =>
  log.find((e) => e.type === 'CONTEST') as never;

/**
 * The contested-node ladder (docs/GAME_DESIGN.md §8.4) is a strict ORDERED
 * ladder, not a scoring system. Every branch gets a test, because this is the
 * module most likely to grow bugs and the one players will argue about.
 */
describe('contested nodes', () => {
  it('1. mutual traps seal the ground — everyone on it burns, no escapes', () => {
    const s = new Scenario('mutual')
      .at(1, 'alexanderplatz')
      .at(2, 'alexanderplatz')
      .loadout(1, ['st_red', 'ps_dead_drop'])
      .loadout(2, ['st_red', 'ps_dead_drop'])
      .intel(1, 10)
      .intel(2, 10)
      .order(1, [ambush(), hold()])
      .order(2, [ambush(), hold()]);

    const { state, log } = resolveRound(s.state);

    expect(contestOf(log)?.method).toBe<ContestMethod>('MUTUAL_TRAP');
    expect(alive(state, 'p1')).toBe(false);
    expect(alive(state, 'p2')).toBe(false);
    // Dead Drop must NOT have saved either of them.
    expect(log.some((e) => e.type === 'PASSIVE_FIRED' && e.effect === 'DEAD_DROP')).toBe(false);
  });

  it('2. a safehouse on the node wins outright, with no roll', () => {
    const s = new Scenario('safehouse')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .safehouse(1, 'alexanderplatz')
      .loadout(1, ['st_red', 'wt_red'])
      .loadout(2, ['st_red', 'wt_red'])
      .intel(1, 10)
      .intel(2, 10)
      // p2 traps its own node; p1 strikes into it. p1 owns the safehouse there.
      .order(2, [ambush(), hold()])
      .order(1, [strike('alexanderplatz'), hold()]);

    const { state, log } = resolveRound(s.state);
    const contest = contestOf(log);

    expect(contest?.method).toBe<ContestMethod>('SAFEHOUSE');
    expect(contest?.winner).toBe('p1');
    expect(alive(state, 'p1')).toBe(true);
    expect(alive(state, 'p2')).toBe(false);
  });

  it('3. neutral ground is a coin flip — and both outcomes really occur', () => {
    const winners = new Set<string>();
    const methods = new Set<string>();

    for (let i = 0; i < 40; i++) {
      const s = new Scenario(`flip-${i}`)
        .at(1, 'friedrichstrasse')
        .at(2, 'alexanderplatz')
        .safehouse(1, null)
        .safehouse(2, null)
        .loadout(1, ['st_red', 'wt_red'])
        .loadout(2, ['st_red', 'wt_red'])
        .intel(1, 10)
        .intel(2, 10)
        .order(2, [ambush(), hold()])
        .order(1, [strike('alexanderplatz'), hold()]);

      const { log } = resolveRound(s.state);
      const c = contestOf(log);
      if (c?.winner) winners.add(c.winner as string);
      if (c) methods.add(c.method);
    }

    expect(methods).toContain('COIN_FLIP');
    expect(winners, 'a 50/50 that only ever produces one winner is not a 50/50').toEqual(
      new Set(['p1', 'p2']),
    );
  });

  it('4. K9 Unit shifts the roll to 75/25 and is consumed either way', () => {
    let k9Wins = 0;
    const runs = 200;

    for (let i = 0; i < runs; i++) {
      const s = new Scenario(`k9-${i}`)
        .at(1, 'friedrichstrasse')
        .at(2, 'alexanderplatz')
        .safehouse(1, null)
        .safehouse(2, null)
        .loadout(1, ['st_red', 'ps_k9'])
        .loadout(2, ['st_red', 'wt_red'])
        .intel(1, 10)
        .intel(2, 10)
        .order(2, [ambush(), hold()])
        .order(1, [strike('alexanderplatz'), hold()]);

      const { state, log } = resolveRound(s.state);
      const c = contestOf(log);
      expect(c?.method).toBe<ContestMethod>('K9_ROLL');
      if (c?.winner === 'p1') k9Wins++;
      // Consumed whether it won or lost.
      expect(state.players['p1']!.passivesAvailable).not.toContain('ps_k9');
    }

    const rate = k9Wins / runs;
    expect(rate, `K9 win rate was ${rate}, expected ~0.75`).toBeGreaterThan(0.65);
    expect(rate).toBeLessThan(0.85);
  });

  it('5. both holding K9 cancels out — both consumed, back to a coin flip', () => {
    const s = new Scenario('k9-both')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .safehouse(1, null)
      .safehouse(2, null)
      .loadout(1, ['st_red', 'ps_k9'])
      .loadout(2, ['st_red', 'ps_k9'])
      .intel(1, 10)
      .intel(2, 10)
      .order(2, [ambush(), hold()])
      .order(1, [strike('alexanderplatz'), hold()]);

    const { state, log } = resolveRound(s.state);

    expect(contestOf(log)?.method).toBe<ContestMethod>('COIN_FLIP');
    expect(state.players['p1']!.passivesAvailable).not.toContain('ps_k9');
    expect(state.players['p2']!.passivesAvailable).not.toContain('ps_k9');
  });

  it('resolves identically no matter which side is listed first', () => {
    const build = (first: 1 | 2) => {
      const s = new Scenario('sym')
        .at(1, 'friedrichstrasse')
        .at(2, 'alexanderplatz')
        .safehouse(1, null)
        .safehouse(2, null)
        .loadout(1, ['st_red', 'wt_red'])
        .loadout(2, ['st_red', 'wt_red'])
        .intel(1, 10)
        .intel(2, 10);
      if (first === 1) {
        s.order(1, [strike('alexanderplatz'), hold()]).order(2, [ambush(), hold()]);
      } else {
        s.order(2, [ambush(), hold()]).order(1, [strike('alexanderplatz'), hold()]);
      }
      return resolveRound(s.state);
    };

    expect(contestOf(build(2).log)?.winner).toBe(contestOf(build(1).log)?.winner);
  });
});

describe('ambushes', () => {
  it('burns an agent that walks in', () => {
    const s = new Scenario('trap-basic')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .loadout(1, ['wt_red', 'wt_blue'])
      .trap(2, 'alexanderplatz')
      .order(1, [move('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state, log } = resolveRound(s.state);

    expect(alive(state, 'p1')).toBe(false);
    expect(log.some((e) => e.type === 'AMBUSH_TRIGGERED' && !e.escaped)).toBe(true);
    expect(state.traps, 'a triggered trap is consumed').toHaveLength(0);
  });

  it('Dead Drop survives it and relocates to the safehouse or nearest U-Bahn', () => {
    const s = new Scenario('dead-drop')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .loadout(1, ['wt_red', 'ps_dead_drop'])
      .safehouse(1, 'tempelhof')
      .trap(2, 'alexanderplatz')
      .order(1, [move('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state, log } = resolveRound(s.state);
    const ev = log.find((e) => e.type === 'AMBUSH_TRIGGERED');

    expect(alive(state, 'p1')).toBe(true);
    expect(ev && ev.type === 'AMBUSH_TRIGGERED' && ev.escaped).toBe(true);
    expect(state.players['p1']!.agents[0]!.nodeId).not.toBe('alexanderplatz');
    expect(state.players['p1']!.passivesAvailable, 'Dead Drop is single use').not.toContain(
      'ps_dead_drop',
    );
  });

  /**
   * Ambush costs Intel but NO action (docs/GAME_DESIGN.md §5.1), so laying a
   * trap no longer competes with moving or striking. Intel and the Strike
   * card's cooldown are the only brakes.
   */
  it('costs Intel but no action — an agent can trap and still act twice', () => {
    const s = new Scenario('free-ambush')
      .at(1, 'alexanderplatz')
      .at(2, 'kurfurstendamm')
      .loadout(1, ['st_red', 'st_blue', 'wt_red'])
      .intel(1, 12);

    const view = viewForOrdering(s.state, s.p(1), s.agent(1) as string);
    const first = legalOrders(view, s.agent(1));
    expect(first.some((x) => x.type === 'AMBUSH')).toBe(true);

    // After both slots are spent, ambush is STILL on the table — and nothing else.
    const bothSpent = legalOrders(view, s.agent(1), [
      move('friedrichstrasse'),
      move('bernauer'),
    ]);
    expect(bothSpent.every((x) => x.type === 'AMBUSH')).toBe(true);
    expect(bothSpent.length).toBeGreaterThan(0);

    // And the full order — two moves plus a trap — is accepted.
    const res = submitOrder(s.state, s.p(1), {
      agentId: s.agent(1),
      actions: [move('friedrichstrasse'), move('bernauer'), ambush('st_red')],
    });
    expect(res.rejection).toBeNull();

    const { state } = resolveRound(res.state);
    expect(state.traps.filter((t) => t.ownerId === 'p1')).toHaveLength(1);
    // Laid where the agent STARTED, then it walked away.
    expect(state.traps[0]!.nodeId).toBe('alexanderplatz');
    expect(state.players['p1']!.agents[0]!.nodeId).toBe('bernauer');
  });

  it('still allows only one new trap per agent per round', () => {
    const s = new Scenario('one-trap')
      .at(1, 'alexanderplatz')
      .at(2, 'kurfurstendamm')
      .loadout(1, ['st_red', 'st_blue', 'wt_red'])
      .intel(1, 12);

    const res = submitOrder(s.state, s.p(1), {
      agentId: s.agent(1),
      actions: [hold(), hold(), ambush('st_red'), ambush('st_blue')],
    });
    expect(res.rejection?.code).toBe('TOO_MANY_ACTIONS');
  });

  it('is invisible to the victim until it fires', () => {
    const s = new Scenario('trap-hidden')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .trap(2, 'alexanderplatz');

    const view = projectView(s.state, s.p(1));
    expect(JSON.stringify(view)).not.toContain('alexanderplatz","expiresAfterRound');
    expect(view.self.traps).toHaveLength(0);
  });
});

describe('co-location', () => {
  it('is safe — two rival agents on a node do nothing to each other', () => {
    const s = new Scenario('colocate')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .order(1, [move('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);

    expect(alive(state, 'p1')).toBe(true);
    expect(alive(state, 'p2')).toBe(true);
  });

  it('whispers "you are not alone" to both sides', () => {
    const s = new Scenario('not-alone')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .order(1, [move('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);

    for (const p of ['p1', 'p2'] as const) {
      const view = projectView(state, p as never);
      expect(
        view.signals.some((sig) => sig.kind === 'NOT_ALONE'),
        `${p} was not told they had company`,
      ).toBe(true);
    }
  });
});

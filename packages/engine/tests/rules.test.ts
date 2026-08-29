import { describe, expect, it } from 'vitest';
import { projectView, resolveRound, validateLoadout, DEFAULT_RULESET, STARTER_LOADOUTS } from '../src/index.js';
import { Scenario, hold, move, strike, wiretap } from './scenario.js';
import type { PlayerId } from '@berlin/shared';

const signalsFor = (state: Parameters<typeof projectView>[0], p: string) =>
  projectView(state, p as PlayerId).signals.map((s) => s.kind);

describe('strike noise', () => {
  /**
   * The rule the game hangs on: a strike always reveals the striker — but not
   * equally to everyone. Adjacent agents get the node; everyone else gets the
   * sector; a silencer buys off the second group but never the first.
   */
  it('gives the exact node to an agent standing next to it', () => {
    const s = new Scenario('noise-near')
      .at(1, 'friedrichstrasse')
      .at(2, 'checkpoint_charlie')
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);
    expect(signalsFor(state, 'p2')).toContain('STRIKE_EXACT');
  });

  it('gives only the sector to everyone else', () => {
    const s = new Scenario('noise-far')
      .at(1, 'friedrichstrasse')
      .at(2, 'kurfurstendamm')
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);
    const kinds = signalsFor(state, 'p2');

    expect(kinds).toContain('STRIKE_VICINITY');
    expect(kinds).not.toContain('STRIKE_EXACT');

    const view = projectView(state, 'p2' as PlayerId);
    const vicinity = view.signals.find((x) => x.kind === 'STRIKE_VICINITY');
    expect(vicinity?.sector).toBe('RED');
    expect(vicinity?.nodeId, 'vicinity must not carry a node id').toBeNull();
  });

  it('a silencer buys off the distant report but not the neighbours', () => {
    const far = new Scenario('silent-far')
      .at(1, 'friedrichstrasse')
      .at(2, 'kurfurstendamm')
      .intel(1, 10)
      .silencers(1, 1)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const farOut = resolveRound(far.state);
    expect(signalsFor(farOut.state, 'p2')).not.toContain('STRIKE_VICINITY');
    expect(farOut.state.players['p1']!.silencers, 'silencer is consumed').toBe(0);

    const near = new Scenario('silent-near')
      .at(1, 'friedrichstrasse')
      .at(2, 'checkpoint_charlie')
      .intel(1, 10)
      .silencers(1, 1)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    expect(signalsFor(resolveRound(near.state).state, 'p2')).toContain('STRIKE_EXACT');
  });

  it('burns whoever is standing on the target', () => {
    const s = new Scenario('strike-hit')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);
    expect(state.players['p2']!.agents[0]!.alive).toBe(false);
    expect(state.players['p1']!.burnsInflicted).toBe(1);
  });

  it('misses a target that moved away — shoot where they are going', () => {
    const s = new Scenario('strike-miss')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [move('prenzlauer_berg'), hold()]);

    const { state } = resolveRound(s.state);
    expect(state.players['p2']!.agents[0]!.alive).toBe(true);
  });
});

describe('wiretaps', () => {
  it('reports OCCUPIED for an agent and never names who', () => {
    const s = new Scenario('scan')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .loadout(2, ['wt_red', 'st_red'])
      .intel(1, 10)
      .order(1, [wiretap('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { log } = resolveRound(s.state);
    const result = log.find((e) => e.type === 'WIRETAP_RESULT');

    expect(result?.type === 'WIRETAP_RESULT' && result.results[0]!.occupied).toBe(true);
    expect(JSON.stringify(result)).not.toContain('p2');
  });

  it('scans post-movement positions, not where they set off from', () => {
    const s = new Scenario('scan-after-move')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .loadout(2, ['wt_red', 'st_red'])
      .intel(1, 10)
      .order(1, [wiretap('alexanderplatz'), hold()])
      .order(2, [move('prenzlauer_berg'), hold()]);

    const { log } = resolveRound(s.state);
    const result = log.find((e) => e.type === 'WIRETAP_RESULT');
    expect(result?.type === 'WIRETAP_RESULT' && result.results[0]!.occupied).toBe(false);
  });

  it('Counter-Surveillance turns the first hit into CLEAR and is consumed', () => {
    const s = new Scenario('counter-surv')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .loadout(2, ['wt_red', 'ps_counter_surv'])
      .intel(1, 10)
      .order(1, [wiretap('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state, log } = resolveRound(s.state);
    const result = log.find((e) => e.type === 'WIRETAP_RESULT');

    expect(result?.type === 'WIRETAP_RESULT' && result.results[0]!.occupied).toBe(false);
    expect(state.players['p2']!.passivesAvailable).not.toContain('ps_counter_surv');
  });
});

describe('blockades', () => {
  it('burns an agent caught in a closing node', () => {
    const s = new Scenario('blockade-kill', { blockadeMode: 'RANDOM' })
      .at(1, 'alexanderplatz')
      .at(2, 'kurfurstendamm')
      // No shelter and no Tunnel Rat — blockades don't negotiate.
      .loadout(1, ['wt_red', 'st_red'])
      .blockade('alexanderplatz', 1)
      .order(1, [hold(), hold()])
      .order(2, [hold(), hold()]);

    const { state, log } = resolveRound(s.state);

    expect(state.players['p1']!.agents[0]!.alive).toBe(false);
    expect(log.some((e) => e.type === 'BLOCKADE_CAUGHT' && !e.survived)).toBe(true);
  });

  it('your own safehouse gets you out, at the cost of an action', () => {
    const s = new Scenario('blockade-safehouse', { blockadeMode: 'RANDOM' })
      .at(1, 'alexanderplatz')
      .at(2, 'kurfurstendamm')
      .safehouse(1, 'alexanderplatz')
      .blockade('alexanderplatz', 1)
      .order(1, [hold(), hold()])
      .order(2, [hold(), hold()]);

    const { state, log } = resolveRound(s.state);

    expect(state.players['p1']!.agents[0]!.alive).toBe(true);
    expect(state.players['p1']!.agents[0]!.nodeId).not.toBe('alexanderplatz');
    expect(log.some((e) => e.type === 'BLOCKADE_CAUGHT' && e.survived)).toBe(true);
  });

  it('Tunnel Rat does the same, once', () => {
    const s = new Scenario('blockade-rat', { blockadeMode: 'RANDOM' })
      .at(1, 'alexanderplatz')
      .at(2, 'kurfurstendamm')
      .loadout(1, ['wt_red', 'ps_tunnel_rat'])
      .blockade('alexanderplatz', 1)
      .order(1, [hold(), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);

    expect(state.players['p1']!.agents[0]!.alive).toBe(true);
    expect(state.players['p1']!.passivesAvailable).not.toContain('ps_tunnel_rat');
  });

  it('destroys traps and decoys inside the sealed node', () => {
    const s = new Scenario('blockade-clears', { blockadeMode: 'RANDOM' })
      .at(1, 'kurfurstendamm')
      .at(2, 'tiergarten')
      .trap(2, 'alexanderplatz')
      .blockade('alexanderplatz', 1)
      .order(1, [hold(), hold()])
      .order(2, [hold(), hold()]);

    expect(resolveRound(s.state).state.traps).toHaveLength(0);
  });

  it('is pre-rolled at match creation, which is what Kontrolle Schedule reads', () => {
    const s = new Scenario('kontrolle', { blockadeMode: 'MIXED' }).loadout(1, [
      'wt_red',
      'ps_kontrolle',
    ]);
    const view = projectView(s.state, 'p1' as PlayerId);
    expect(view.self.knownBlockades.length).toBe(s.state.blockadeSchedule.length);
    expect(projectView(s.state, 'p2' as PlayerId).self.knownBlockades).toHaveLength(0);
  });
});

describe('burning is permanent', () => {
  it('drops carried dossiers where the agent fell', () => {
    // Killed by a blockade, so nobody is standing there to loot the body.
    const s = new Scenario('drop', { blockadeMode: 'RANDOM' })
      .at(1, 'alexanderplatz')
      .at(2, 'kurfurstendamm')
      .loadout(1, ['wt_red', 'st_red'])
      .dossiers(1, 2)
      .blockade('alexanderplatz', 1)
      .order(1, [hold(), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);
    expect(state.players['p1']!.agents[0]!.alive).toBe(false);
    expect(state.nodes['alexanderplatz']!.dossiers).toBe(2);
  });

  it('lets the striker advance in and take what the victim was carrying', () => {
    const s = new Scenario('loot')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .loadout(2, ['wt_red', 'st_red'])
      .dossiers(2, 2)
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);
    expect(state.players['p2']!.agents[0]!.alive).toBe(false);
    expect(state.players['p1']!.agents[0]!.nodeId).toBe('alexanderplatz');
    expect(state.players['p1']!.agents[0]!.dossiers).toBe(2);
  });

  it('releases informants and clears the safehouse, decoys, and traps', () => {
    const s = new Scenario('cleanup')
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .safehouse(2, 'prenzlauer_berg')
      .trap(2, 'karl_marx_allee')
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    s.state.nodes['prenzlauer_berg']!.informantOwner = 'p2' as PlayerId;

    const { state, log } = resolveRound(s.state);

    expect(state.players['p2']!.eliminated).toBe(true);
    expect(state.players['p2']!.safehouse).toBeNull();
    expect(state.nodes['prenzlauer_berg']!.informantOwner).toBeNull();
    expect(state.traps.filter((t) => t.ownerId === 'p2')).toHaveLength(0);
    expect(log.some((e) => e.type === 'PLAYER_ELIMINATED')).toBe(true);
    expect(state.outcome?.reason).toBe('ELIMINATION');
    expect(state.outcome?.winners).toEqual(['p1']);
  });

  it('never respawns a burned agent', () => {
    const s = new Scenario('no-respawn', { agentsPerPlayer: 2 })
      .at(1, 'friedrichstrasse')
      .at(2, 'alexanderplatz')
      .at(2, 'karl_marx_allee', 2)
      .intel(1, 10)
      .order(1, [strike('alexanderplatz'), hold()])
      .order(2, [hold(), hold()])
      .order(2, [hold(), hold()], 2);

    let state = resolveRound(s.state).state;
    expect(state.players['p2']!.agents[0]!.alive).toBe(false);

    for (let i = 0; i < 3; i++) {
      state = resolveRound(state).state;
      expect(state.players['p2']!.agents[0]!.alive, 'agents must never come back').toBe(false);
    }
    expect(state.players['p2']!.eliminated, 'one agent still standing').toBe(false);
  });
});

describe('objectives', () => {
  it('picks up a dossier and announces the node publicly', () => {
    const s = new Scenario('pickup')
      .at(1, 'friedrichstrasse')
      .at(2, 'kurfurstendamm')
      .nodeDossiers('alexanderplatz', 1)
      .order(1, [move('alexanderplatz'), hold()])
      .order(2, [hold(), hold()]);

    const { state, log } = resolveRound(s.state);

    expect(state.players['p1']!.agents[0]!.dossiers).toBe(1);
    expect(log.some((e) => e.type === 'DOSSIER_TAKEN')).toBe(true);
    expect(signalsFor(state, 'p2')).toContain('DOSSIER_TAKEN');
  });

  it('wins on extraction with a full set at your own extraction point', () => {
    const s = new Scenario('extract')
      .at(1, 'tempelhof')
      .at(2, 'kurfurstendamm')
      .dossiers(1, 3)
      .order(1, [hold(), hold()])
      .order(2, [hold(), hold()]);

    const { state } = resolveRound(s.state);
    expect(state.outcome?.reason).toBe('EXTRACTION');
    expect(state.outcome?.winners).toEqual(['p1']);
  });

  it('does not let a burned agent extract — objectives resolve last', () => {
    const s = new Scenario('extract-denied')
      .at(1, 'tempelhof')
      .at(2, 'kreuzberg')
      .loadout(1, ['wt_red', 'st_red'])
      .dossiers(1, 3)
      .intel(2, 10)
      .order(1, [hold(), hold()])
      .order(2, [strike('tempelhof'), hold()]);

    const { state } = resolveRound(s.state);
    expect(state.players['p1']!.agents[0]!.alive).toBe(false);
    expect(state.outcome?.reason).not.toBe('EXTRACTION');
    // The killer advanced onto the node, so the papers changed hands.
    expect(state.players['p2']!.agents[0]!.dossiers).toBe(3);
  });
});

describe('loadout construction', () => {
  it('accepts every starter loadout', () => {
    for (const [name, loadout] of Object.entries(STARTER_LOADOUTS)) {
      expect(validateLoadout(loadout, DEFAULT_RULESET), `${name} is invalid`).toEqual([]);
    }
  });

  it('rejects the wrong size, too many of one icon, one color, and overspending', () => {
    const codes = (l: string[]) =>
      validateLoadout(l as never, DEFAULT_RULESET).map((v) => v.code);

    expect(codes(['st_red'])).toContain('WRONG_SIZE');
    expect(codes(Array(10).fill('st_red'))).toContain('ICON_LIMIT');
    expect(codes(Array(10).fill('st_red'))).toContain('TOO_FEW_COLORS');
    expect(codes(['nonsense', ...Array(9).fill('st_red')])).toContain('UNKNOWN_CARD');
    expect(
      codes(['st_red', 'st_blue', 'st_gold', 'ps_kontrolle', 'ps_ghost', 'ps_k9', 'ps_dead_drop', 'ps_sleeper', 'ps_bagman', 'ps_papers']),
    ).toContain('OVER_BUDGET');
  });
});

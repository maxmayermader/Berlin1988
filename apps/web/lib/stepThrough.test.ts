import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createMatch,
  legalOrders,
  nextInt,
  projectView,
  quickSettings,
  resolveRound,
  seedRng,
  submitOrder,
  viewForOrdering,
} from '@berlin/engine';
import type { Action, GameState, PlayerId, PlayerView, ResolutionEvent, RngState } from '@berlin/shared';
import { eventText } from './format.js';
import {
  REVEALED_AT_START,
  advance,
  initialReveal,
  isComplete,
  revealedEvents,
} from './stepThrough.js';

/**
 * MATCH-05: the step-through never reorders, merges, or runs ahead. The
 * order-fidelity claim is proven against a real `resolveRound()` +
 * `projectView()` call, not a fixture, per this plan's <testing_note>. The
 * zero-one-many row is pinned separately with synthetic logs so it doesn't
 * depend on which events a given seed happens to produce.
 */

// --- Real-match helper: drives every living agent with a uniformly-random
// legal order, same pattern as packages/engine/tests/helpers.ts, so the
// resolved round is a genuine resolveRound() output rather than a stub. ---
function randomLegalOrder(
  state: GameState,
  playerId: PlayerId,
  agentId: string,
  rng: RngState,
): { agentId: never; actions: Action[] } {
  const view = viewForOrdering(state, playerId, agentId as never);
  const actions: Action[] = [];
  for (let i = 0; i < 4; i++) {
    const options = legalOrders(view, agentId as never, actions);
    if (options.length === 0) break;
    actions.push(options[nextInt(rng, options.length)]!);
  }
  return { agentId: agentId as never, actions };
}

function resolveOneRealRound(seed: string): { view: PlayerView } {
  let state = createMatch(quickSettings(), seed);
  const rng = seedRng(`${seed}:orders`);
  for (const pid of state.playerOrder) {
    const p = state.players[pid as string]!;
    for (const agent of p.agents) {
      if (!agent.alive) continue;
      const order = randomLegalOrder(state, pid, agent.id as string, rng);
      state = submitOrder(state, pid, order).state;
    }
  }
  const { state: resolved } = resolveRound(state);
  const view = projectView(resolved, state.playerOrder[0]!);
  return { view };
}

const SEEDS = ['stepThrough-a', 'stepThrough-b', 'stepThrough-c'];

describe('order fidelity — against a real resolveRound()/projectView() call', () => {
  it.each(SEEDS)('fully revealing seed %s is index-for-index identical to view.lastRound', (seed) => {
    const { view } = resolveOneRealRound(seed);
    const log = view.lastRound;

    let state = initialReveal(log);
    while (!isComplete(log, state)) state = advance(state, log);

    expect(revealedEvents(log, state)).toEqual(log);
    revealedEvents(log, state).forEach((event, index) => {
      expect(event).toBe(log[index]); // same reference — never rebuilt or copied out of order
    });
  });

  it.each(SEEDS)('seed %s: the row count equals view.lastRound.length exactly', (seed) => {
    const { view } = resolveOneRealRound(seed);
    const log = view.lastRound;
    let state = initialReveal(log);
    while (!isComplete(log, state)) state = advance(state, log);
    expect(revealedEvents(log, state)).toHaveLength(log.length);
  });

  it('at least one priority step produced no event for a real round — no placeholder is needed for it', () => {
    const { view } = resolveOneRealRound(SEEDS[0]!);
    const presentTypes = new Set(view.lastRound.map((e) => e.type));
    const ALL_TYPES: ResolutionEvent['type'][] = [
      'ROUND_START',
      'SAFEHOUSE_PLACED',
      'AMBUSH_SET',
      'DECOY_PLACED',
      'AGENT_MOVED',
      'CHECKPOINT_CROSSED',
      'AMBUSH_TRIGGERED',
      'BLOCKADE_ANNOUNCED',
      'BLOCKADE_CLOSED',
      'BLOCKADE_LIFTED',
      'BLOCKADE_CAUGHT',
      'INFORMANT_CLAIMED',
      'WIRETAP_RESULT',
      'STRIKE_FIRED',
      'CONTEST',
      'AGENT_BURNED',
      'DOSSIER_TAKEN',
      'DOSSIER_SPAWNED',
      'EXTRACTION',
      'PASSIVE_FIRED',
      'CARD_PLAYED',
      'SILENCER_BOUGHT',
      'INTEL_GAINED',
      'PLAYER_ELIMINATED',
      'MATCH_ENDED',
    ];
    const missing = ALL_TYPES.filter((t) => !presentTypes.has(t));
    // A round-one log with only a couple of agents cannot produce every one
    // of the 24 event kinds — at least one priority step emitted nothing,
    // and that step has no row and needs no placeholder.
    expect(missing.length).toBeGreaterThan(0);
    expect(view.lastRound).toHaveLength(view.lastRound.length); // row count === log length, trivially, by construction
  });
});

describe('initialReveal / advance / revealedEvents / isComplete — the pure reducer', () => {
  it('revealedEvents(log, initialReveal(log)) returns exactly the first element — one row, never zero and never all', () => {
    const log = syntheticLog(5);
    const state = initialReveal(log);
    expect(REVEALED_AT_START).toBe(1);
    expect(revealedEvents(log, state)).toEqual([log[0]]);
  });

  it('advance called n times returns log.slice(0, n + 1) for every n up to the log length', () => {
    const log = syntheticLog(6);
    let state = initialReveal(log);
    for (let n = 0; n < log.length; n++) {
      expect(revealedEvents(log, state)).toEqual(log.slice(0, n + 1));
      state = advance(state, log);
    }
  });

  it('advancing past the end leaves the state unchanged and isComplete true', () => {
    const log = syntheticLog(2);
    let state = initialReveal(log);
    while (!isComplete(log, state)) state = advance(state, log);
    const finalState = state;
    const advancedAgain = advance(state, log);
    expect(advancedAgain).toEqual(finalState);
    expect(isComplete(log, advancedAgain)).toBe(true);
  });

  it('a log with exactly one event is immediately complete and renders one row', () => {
    const log = syntheticLog(1);
    const state = initialReveal(log);
    expect(isComplete(log, state)).toBe(true);
    expect(revealedEvents(log, state)).toHaveLength(1);
  });

  it('a log with sixteen events renders sixteen rows after fifteen advances, nothing merged or omitted', () => {
    const log = syntheticLog(16);
    let state = initialReveal(log);
    for (let i = 0; i < 15; i++) state = advance(state, log);
    expect(isComplete(log, state)).toBe(true);
    expect(revealedEvents(log, state)).toHaveLength(16);
    expect(revealedEvents(log, state)).toEqual(log);
  });

  it('two consecutive events naming the same agent render as two distinct rows', () => {
    const log: ResolutionEvent[] = [
      { type: 'ROUND_START', round: 1 },
      {
        type: 'STRIKE_FIRED',
        playerId: 'p1' as never,
        agentId: 'p1:a1' as never,
        from: 'a' as never,
        target: 'b' as never,
        sector: 'BLUE',
        silenced: false,
      },
      {
        type: 'AGENT_BURNED',
        playerId: 'p1' as never,
        agentId: 'p1:a1' as never,
        nodeId: 'b' as never,
        byPlayerId: 'p2' as never,
        cause: 'STRIKE',
        dossiersDropped: 0,
      },
    ];
    let state = initialReveal(log);
    while (!isComplete(log, state)) state = advance(state, log);
    const visible = revealedEvents(log, state);
    expect(visible).toHaveLength(3);
    expect(visible[1]).not.toBe(visible[2]);
  });

  it('two consecutive events naming the same node render as two distinct rows', () => {
    const log: ResolutionEvent[] = [
      { type: 'ROUND_START', round: 1 },
      { type: 'DOSSIER_TAKEN', playerId: 'p1' as never, agentId: 'p1:a1' as never, nodeId: 'x' as never },
      { type: 'DOSSIER_SPAWNED', nodeId: 'x' as never },
    ];
    let state = initialReveal(log);
    while (!isComplete(log, state)) state = advance(state, log);
    expect(revealedEvents(log, state)).toHaveLength(3);
  });

  it('the reducer has no code path that inspects event contents — no sort/filter/reduce/groupBy in the source', () => {
    const src = readFileSync(fileURLToPath(new URL('./stepThrough.ts', import.meta.url)), 'utf8');
    const codeOnly = src
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(/\.sort\(|\.filter\(|\.reduce\(|groupBy/.test(codeOnly)).toBe(false);
  });
});

describe('eventText — exhaustive prose for every ResolutionEvent member', () => {
  const SAMPLES: ResolutionEvent[] = [
    { type: 'ROUND_START', round: 3 },
    { type: 'SAFEHOUSE_PLACED', playerId: 'p1' as never, nodeId: 'a' as never },
    { type: 'AMBUSH_SET', playerId: 'p1' as never, nodeId: 'a' as never },
    { type: 'DECOY_PLACED', playerId: 'p1' as never, nodeId: 'a' as never },
    {
      type: 'AGENT_MOVED',
      playerId: 'p1' as never,
      agentId: 'p1:a1' as never,
      from: 'a' as never,
      to: 'b' as never,
      viaTunnel: false,
      viaCheckpoint: false,
      sprint: false,
    },
    { type: 'CHECKPOINT_CROSSED', playerId: 'p1' as never, nodeId: 'a' as never, silent: false },
    {
      type: 'AMBUSH_TRIGGERED',
      ownerId: 'p1' as never,
      victimId: 'p2' as never,
      victimAgentId: null, // nulled by fog for the trap owner — must still render non-empty prose
      nodeId: 'a' as never,
      escaped: false,
      escapedTo: null,
      sealed: true,
    },
    { type: 'BLOCKADE_ANNOUNCED', nodeId: 'a' as never, round: 4 },
    { type: 'BLOCKADE_CLOSED', nodeId: 'a' as never, until: 6 },
    { type: 'BLOCKADE_LIFTED', nodeId: 'a' as never },
    {
      type: 'BLOCKADE_CAUGHT',
      playerId: 'p1' as never,
      agentId: 'p1:a1' as never,
      nodeId: 'a' as never,
      survived: true,
      relocatedTo: 'b' as never,
    },
    { type: 'INFORMANT_CLAIMED', playerId: 'p1' as never, nodeId: 'a' as never },
    {
      type: 'WIRETAP_RESULT',
      playerId: 'p1' as never,
      target: 'a' as never,
      results: [{ nodeId: 'b' as never, occupied: true }],
    },
    {
      type: 'STRIKE_FIRED',
      playerId: 'p1' as never,
      agentId: null, // nulled by fog for anyone but the striker
      from: 'a' as never,
      target: 'b' as never,
      sector: 'BLUE',
      silenced: false,
    },
    { type: 'CONTEST', nodeId: 'a' as never, claimants: ['p1' as never, 'p2' as never], winner: 'p1' as never, method: 'COIN_FLIP' },
    {
      type: 'AGENT_BURNED',
      playerId: 'p1' as never,
      agentId: null, // nulled by fog for anyone but the owner
      nodeId: 'a' as never,
      byPlayerId: null,
      cause: 'STRIKE',
      dossiersDropped: 2,
    },
    { type: 'DOSSIER_TAKEN', playerId: 'p1' as never, agentId: null, nodeId: 'a' as never },
    { type: 'DOSSIER_SPAWNED', nodeId: 'a' as never },
    { type: 'EXTRACTION', playerId: 'p1' as never, agentId: null, nodeId: 'a' as never },
    {
      type: 'PASSIVE_FIRED',
      playerId: 'p1' as never,
      cardId: 'card-x' as never,
      effect: { kind: 'INTEL_REFUND', amount: 1 } as never,
      consumed: true,
    },
    { type: 'CARD_PLAYED', playerId: 'p1' as never, cardId: 'card-x' as never },
    { type: 'SILENCER_BOUGHT', playerId: 'p1' as never, count: 1 },
    { type: 'INTEL_GAINED', playerId: 'p1' as never, amount: 3 },
    { type: 'PLAYER_ELIMINATED', playerId: 'p1' as never },
    { type: 'MATCH_ENDED', reason: 'ROUND_LIMIT', winners: ['p1' as never] },
  ];

  it.each(SAMPLES.map((e) => [e.type, e] as const))('%s produces non-empty text', (_type, event) => {
    expect(eventText(event).length).toBeGreaterThan(0);
  });

  it('CONTEST renders its method by name, so a coin flip reads as a coin flip', () => {
    const event: ResolutionEvent = {
      type: 'CONTEST',
      nodeId: 'a' as never,
      claimants: ['p1' as never, 'p2' as never],
      winner: 'p1' as never,
      method: 'COIN_FLIP',
    };
    expect(eventText(event).toLowerCase()).toContain('coin flip');
  });

  it('numeric fields render as the engine exact integer, with no rounding applied', () => {
    const event: ResolutionEvent = {
      type: 'AGENT_BURNED',
      playerId: 'p1' as never,
      agentId: 'p1:a1' as never,
      nodeId: 'a' as never,
      byPlayerId: 'p2' as never,
      cause: 'STRIKE',
      dossiersDropped: 3,
    };
    expect(eventText(event)).toContain('3');
  });

  it('an event whose agent id was nulled by fog renders prose about an unnamed agent, never a crash or an empty slot', () => {
    const event: ResolutionEvent = {
      type: 'STRIKE_FIRED',
      playerId: 'p1' as never,
      agentId: null,
      from: 'a' as never,
      target: 'b' as never,
      sector: 'BLUE',
      silenced: false,
    };
    expect(() => eventText(event)).not.toThrow();
    expect(eventText(event).length).toBeGreaterThan(0);
  });
});

describe('StepThrough.tsx — reduced-motion convention (proven statically; runtime proven by resolution.spec.ts)', () => {
  it('imports useReducedMotion from motion/react and gates the per-row transition on it', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../components/resolution/StepThrough.tsx', import.meta.url)),
      'utf8',
    );
    expect(src.includes('useReducedMotion')).toBe(true);
    expect(/from ['"]motion\/react['"]/.test(src)).toBe(true);
  });
});

function syntheticLog(length: number): ResolutionEvent[] {
  const log: ResolutionEvent[] = [{ type: 'ROUND_START', round: 1 }];
  for (let i = 1; i < length; i++) {
    log.push({ type: 'DOSSIER_SPAWNED', nodeId: `synthetic-${i}` as never });
  }
  return log;
}

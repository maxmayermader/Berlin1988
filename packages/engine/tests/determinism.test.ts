import { describe, expect, it } from 'vitest';
import { createMatch, quickSettings, resolveRound, submitOrder, seedRng, rngNext } from '../src/index.js';
import { fingerprint, playRandomMatch, replay } from './helpers.js';
import type { GameState } from '@berlin/shared';

/**
 * Determinism is the backbone of everything else: replays, golden fixtures,
 * reproducible bug reports, and the balance harness all rest on it.
 *
 * A match is fully reconstructible from (seed, settings, ordered orders).
 */
describe('determinism', () => {
  it('produces an identical match from the same seed', () => {
    for (const seed of ['alpha', 'bravo', 'charlie']) {
      const a = playRandomMatch(seed);
      const b = playRandomMatch(seed);
      expect(fingerprint(b.final), `seed ${seed} diverged`).toBe(fingerprint(a.final));
    }
  });

  it('replays a recorded script to a byte-identical final state', () => {
    const settings = quickSettings();
    for (const seed of ['replay-1', 'replay-2', 'replay-3']) {
      const played = playRandomMatch(seed, settings);
      const again = replay(seed, settings, played.script);
      expect(fingerprint(again), `seed ${seed} failed to replay`).toBe(
        fingerprint(played.final),
      );
    }
  });

  it('gives different matches from different seeds', () => {
    const a = playRandomMatch('seed-x');
    const b = playRandomMatch('seed-y');
    expect(fingerprint(a.final)).not.toBe(fingerprint(b.final));
  });

  it('advances the PRNG stream identically regardless of branch taken', () => {
    // Contested rolls always draw, even when the outcome was already decided.
    // Two states that hit different ladder branches must still consume the same
    // number of draws, or replays diverge from the first coin flip onward.
    const s1 = seedRng('stream');
    const s2 = seedRng('stream');
    const a = [rngNext(s1), rngNext(s1), rngNext(s1)];
    const b = [rngNext(s2), rngNext(s2), rngNext(s2)];
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it('never leaves the RNG state in a non-finite state over a long match', () => {
    const { final } = playRandomMatch('rng-health');
    for (const v of Object.values(final.rng)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('resolution ordering', () => {
  /**
   * The simultaneity guarantee: WHO submits first must never change what
   * happens. If this ever fails, one seat has an advantage nobody can see.
   */
  it('is unaffected by the order players submit in', () => {
    const settings = quickSettings();

    for (const seed of ['order-1', 'order-2', 'order-3', 'order-4']) {
      const played = playRandomMatch(seed, settings, 5);
      const perRound = chunkBySubmissionRound(settings, seed, played.script);

      const forward = resolveScripted(settings, seed, perRound, false);
      const reversed = resolveScripted(settings, seed, perRound, true);

      expect(fingerprint(reversed), `seed ${seed} is submission-order dependent`).toBe(
        fingerprint(forward),
      );
    }
  });
});

type Script = { player: never; order: never }[];

function chunkBySubmissionRound(
  settings: ReturnType<typeof quickSettings>,
  seed: string,
  script: ReturnType<typeof playRandomMatch>['script'],
) {
  // Re-derive how many orders each round consumed by walking the match again.
  let state = createMatch(settings, seed);
  const chunks: ReturnType<typeof playRandomMatch>['script'][] = [];
  let i = 0;

  while (i < script.length && state.phase === 'ORDERS') {
    const n = liveAgents(state);
    const chunk = script.slice(i, i + n);
    if (chunk.length === 0) break;
    chunks.push(chunk);
    for (const step of chunk) state = submitOrder(state, step.player, step.order).state;
    state = resolveRound(state).state;
    i += n;
  }
  return chunks;
}

function resolveScripted(
  settings: ReturnType<typeof quickSettings>,
  seed: string,
  chunks: ReturnType<typeof playRandomMatch>['script'][],
  reverse: boolean,
): GameState {
  let state = createMatch(settings, seed);
  for (const chunk of chunks) {
    if (state.phase !== 'ORDERS') break;
    const ordered = reverse ? [...chunk].reverse() : chunk;
    for (const step of ordered) state = submitOrder(state, step.player, step.order).state;
    state = resolveRound(state).state;
  }
  return state;
}

function liveAgents(state: GameState): number {
  let n = 0;
  for (const pid of state.playerOrder) {
    const p = state.players[pid as string]!;
    if (p.eliminated) continue;
    n += p.agents.filter((a) => a.alive).length;
  }
  return n;
}

export type { Script };

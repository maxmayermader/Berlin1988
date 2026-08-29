import type { Action, RngState } from '@berlin/shared';
import { rngNext } from '@berlin/engine';
import { FEATURE_KEYS, type Features } from './features.js';
import type { Weights } from './personalities/index.js';
import type { DifficultyTier } from './difficulty.js';

export interface Scored {
  readonly action: Action;
  readonly score: number;
  readonly features: Features;
}

/** score = Σ (personality.weights[f] × features[f]) */
export function score(features: Features, weights: Weights): number {
  let s = 0;
  for (const k of FEATURE_KEYS) s += weights[k] * features[k];
  return s;
}

/**
 * Softmax at the difficulty's temperature, then a blunder roll.
 *
 * The blunder substitutes the SECOND-best move rather than a random one, which
 * produces recognisably human mistakes instead of noise — a bot that
 * occasionally takes the reasonable-but-wrong option reads as fallible; one
 * that occasionally does something absurd reads as broken.
 *
 * Always draws exactly twice, whatever branch it takes, so the RNG stream stays
 * aligned across difficulties and a seeded match replays identically.
 */
export function choose(
  candidates: readonly Scored[],
  tier: DifficultyTier,
  rng: RngState,
): Action | null {
  const softmaxRoll = rngNext(rng);
  const blunderRoll = rngNext(rng);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!.action;

  const ranked = [...candidates].sort((a, b) => b.score - a.score);

  if (blunderRoll < tier.blunderRate) {
    return ranked[1]!.action;
  }

  const t = Math.max(0.01, tier.temperature);
  const top = ranked[0]!.score;
  let total = 0;
  const weights = ranked.map((c) => {
    const e = Math.exp((c.score - top) / t);
    total += e;
    return e;
  });

  let acc = 0;
  const target = softmaxRoll * total;
  for (let i = 0; i < ranked.length; i++) {
    acc += weights[i]!;
    if (acc >= target) return ranked[i]!.action;
  }
  return ranked[0]!.action;
}

import type { RngState } from '@berlin/shared';

/**
 * The ONLY source of randomness in the project. Math.random() is banned
 * everywhere below apps/ — see packages/engine/CLAUDE.md.
 *
 * sfc32, seeded by cyrb128. Fast, small, and good enough for a 18-node graph.
 * State lives in GameState so a match replays identically from its seed.
 */

/** Hash an arbitrary seed string into four 32-bit words. */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return {
    a: (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    b: (h2 ^ h1) >>> 0,
    c: (h3 ^ h1) >>> 0,
    d: (h4 ^ h1) >>> 0,
  };
}

/** Advance the stream, returning a float in [0, 1). Mutates state in place. */
export function next(s: RngState): number {
  const t = (s.a + s.b) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.d = (s.d + 1) | 0;
  const r = (t + s.d) | 0;
  s.c = (s.c + r) | 0;
  return (r >>> 0) / 4294967296;
}

/** Integer in [0, maxExclusive). */
export function nextInt(s: RngState, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  return Math.floor(next(s) * maxExclusive);
}

/** True with the given probability. */
export function chance(s: RngState, p: number): boolean {
  return next(s) < p;
}

/**
 * Pick one element. Always draws exactly once, even from a single-element or
 * empty list, so the stream advances identically regardless of the branch taken.
 */
export function pick<T>(s: RngState, items: readonly T[]): T | undefined {
  const i = nextInt(s, items.length);
  return items[i];
}

/** Fisher-Yates. Returns a new array; consumes n-1 draws. */
export function shuffled<T>(s: RngState, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

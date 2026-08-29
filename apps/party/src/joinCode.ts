import { nextInt } from '@berlin/engine';
import type { RngState } from '@berlin/shared';
import { customRandom } from 'nanoid';

/**
 * Upper-case letters and digits with the visually ambiguous glyphs removed
 * (0, O, 1, I, L) — 31 symbols. A private-lobby usability code, not a
 * security token, but ~30 bits over 6 symbols is well past brute-forceable
 * within a single match's lifetime (01-RESEARCH.md T-1-04).
 */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

/** Draws `size` bytes from the engine's seeded PRNG — never the platform's
 *  global random source, so the code generator stays replay-safe. */
function bytesFrom(rng: RngState, size: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = nextInt(rng, 256);
  return out;
}

/**
 * A JOIN_CODE_LENGTH-character join code drawn from JOIN_CODE_ALPHABET,
 * built on nanoid's customRandom seeded from the engine's RngState — the
 * platform's own random source is never touched. Uniqueness is
 * generate-claim-retry scoped to active lobbies (01-RESEARCH.md "Don't
 * Hand-Roll"), not a database existence check: the code is the room id.
 */
export function newJoinCode(rng: RngState): string {
  const generate = customRandom(JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, (size) => bytesFrom(rng, size));
  return generate();
}

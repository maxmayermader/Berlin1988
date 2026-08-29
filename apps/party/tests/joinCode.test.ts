import { seedRng } from '@berlin/engine';
import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, newJoinCode } from '../src/joinCode.js';

describe('JOIN_CODE_ALPHABET', () => {
  it('has 31 symbols and excludes ambiguous glyphs', () => {
    expect(JOIN_CODE_ALPHABET.length).toBe(31);
    for (const glyph of ['0', 'O', '1', 'I', 'L', 'o', 'i', 'l']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(glyph);
    }
  });
});

describe('newJoinCode', () => {
  it('returns a JOIN_CODE_LENGTH string drawn only from JOIN_CODE_ALPHABET', () => {
    const code = newJoinCode(seedRng('a-fixed-seed'));
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
    for (const char of code) {
      expect(JOIN_CODE_ALPHABET).toContain(char);
    }
  });

  it('is deterministic — the same seeded RNG state produces the same code', () => {
    const a = newJoinCode(seedRng('reproducible-seed'));
    const b = newJoinCode(seedRng('reproducible-seed'));
    expect(a).toBe(b);
  });

  it('produces at least 9990 distinct codes across 10,000 distinct seeds', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      codes.add(newJoinCode(seedRng(`seed-${i}`)));
    }
    expect(codes.size).toBeGreaterThanOrEqual(9990);
  });
});

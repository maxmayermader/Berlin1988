import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CODENAME_MAX_LENGTH } from './identity.js';
import { truncateCodename } from './format.js';

/**
 * The 20-character ellipsis rule (01-UI-SPEC.md overflow row), and the
 * static-convention checks for the two remaining Task 3 deltas that have no
 * unit-testable runtime surface (no React component-testing stack this
 * phase, per <testing_note>): RoundClock's urgency accent and LockedInRow's
 * use of the one shared truncation helper.
 */

describe('truncateCodename', () => {
  it('leaves a 19-character name untouched', () => {
    const name = 'A'.repeat(19);
    expect(truncateCodename(name)).toBe(name);
    expect(truncateCodename(name).length).toBe(19);
  });

  it('leaves a name at exactly CODENAME_MAX_LENGTH (20) untouched', () => {
    expect(CODENAME_MAX_LENGTH).toBe(20);
    const name = 'B'.repeat(20);
    expect(truncateCodename(name)).toBe(name);
  });

  it('truncates a 21-character name and ends it in an ellipsis', () => {
    const name = 'C'.repeat(21);
    const result = truncateCodename(name);
    expect(result.length).toBe(20);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('RoundClock — urgency accent is a static colour change, not an animation', () => {
  it('applies the #2563EB accent under ten seconds, with no motion import', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../components/hud/RoundClock.tsx', import.meta.url)),
      'utf8',
    );
    expect(/#2563eb/i.test(src)).toBe(true);
    expect(/isUrgent\(/.test(src)).toBe(true);
    expect(/from ['"]motion/.test(src)).toBe(false); // D-10: no animation beyond D-06
  });
});

describe('LockedInRow — codename truncation uses the one shared helper', () => {
  it('calls truncateCodename rather than re-implementing the 20-character rule', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../components/hud/LockedInRow.tsx', import.meta.url)),
      'utf8',
    );
    expect(/truncateCodename\(/.test(src)).toBe(true);
  });
});

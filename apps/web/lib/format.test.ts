import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ResolutionEvent } from '@berlin/shared';
import { CODENAME_MAX_LENGTH } from './identity.js';
import { roundHeadline, roundNumberOf, truncateCodename } from './format.js';

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

/** Minimal-field builders — only the fields eventText/roundHeadline/
 *  roundNumberOf actually read, following stepThrough.test.ts's `as never`
 *  branded-id convention for the ids that don't matter to these functions. */
function extraction(): ResolutionEvent {
  return { type: 'EXTRACTION', playerId: 'p1' as never, agentId: null, nodeId: 'a' as never };
}
function agentBurned(): ResolutionEvent {
  return {
    type: 'AGENT_BURNED',
    playerId: 'p1' as never,
    agentId: null,
    nodeId: 'a' as never,
    byPlayerId: null,
    cause: 'STRIKE',
    dossiersDropped: 0,
  };
}
function contest(): ResolutionEvent {
  return {
    type: 'CONTEST',
    nodeId: 'a' as never,
    claimants: ['p1' as never, 'p2' as never],
    winner: 'p1' as never,
    method: 'COIN_FLIP',
  };
}
function roundStart(round: number): ResolutionEvent {
  return { type: 'ROUND_START', round };
}
function agentMoved(): ResolutionEvent {
  return {
    type: 'AGENT_MOVED',
    playerId: 'p1' as never,
    agentId: 'p1:a1' as never,
    from: 'a' as never,
    to: 'b' as never,
    viaTunnel: false,
    viaCheckpoint: false,
    sprint: false,
  };
}
function intelGained(): ResolutionEvent {
  return { type: 'INTEL_GAINED', playerId: 'p1' as never, amount: 1 };
}

describe('roundHeadline — priority-ordered, template-bounded round summary', () => {
  it('three EXTRACTION events and nothing else notable returns "3 dossiers extracted"', () => {
    const log = [roundStart(1), extraction(), extraction(), extraction()];
    expect(roundHeadline(log)).toBe('3 dossiers extracted');
  });

  it('exactly one EXTRACTION event returns "1 dossier extracted" — singular, no trailing s', () => {
    const log = [roundStart(1), extraction()];
    expect(roundHeadline(log)).toBe('1 dossier extracted');
  });

  it('two AGENT_BURNED events and no extractions returns "2 agents burned"', () => {
    const log = [roundStart(1), agentBurned(), agentBurned()];
    expect(roundHeadline(log)).toBe('2 agents burned');
  });

  it('one CONTEST event and no extractions or burns returns "1 contested node"', () => {
    const log = [roundStart(1), contest()];
    expect(roundHeadline(log)).toBe('1 contested node');
  });

  it('two CONTEST events returns "2 contested nodes"', () => {
    const log = [roundStart(1), contest(), contest()];
    expect(roundHeadline(log)).toBe('2 contested nodes');
  });

  it('extractions and burns both present join with "; ", extractions first', () => {
    const log = [roundStart(1), agentBurned(), extraction()];
    expect(roundHeadline(log)).toBe('1 dossier extracted; 1 agent burned');
  });

  it('all three categories present cap at two clauses, exactly one "; " separator', () => {
    const log = [roundStart(1), extraction(), agentBurned(), contest()];
    const result = roundHeadline(log);
    expect(result).toBe('1 dossier extracted; 1 agent burned');
    expect((result.match(/; /g) ?? []).length).toBe(1);
  });

  it('a log with only ROUND_START, AGENT_MOVED and INTEL_GAINED returns "quiet round"', () => {
    const log = [roundStart(1), agentMoved(), intelGained()];
    expect(roundHeadline(log)).toBe('quiet round');
  });

  it('an empty log returns "quiet round" and does not throw', () => {
    expect(() => roundHeadline([])).not.toThrow();
    expect(roundHeadline([])).toBe('quiet round');
  });
});

describe('roundNumberOf — round number from the log\'s own ROUND_START, with a fallback', () => {
  it('a log whose first event is ROUND_START round 7 returns 7', () => {
    const log = [roundStart(7), extraction()];
    expect(roundNumberOf(log, 1)).toBe(7);
  });

  it('a log whose first event is not ROUND_START returns the fallback', () => {
    const log = [extraction(), roundStart(3)];
    expect(roundNumberOf(log, 9)).toBe(9);
  });

  it('an empty log returns the fallback', () => {
    expect(roundNumberOf([], 5)).toBe(5);
  });
});

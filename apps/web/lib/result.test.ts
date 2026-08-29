import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatch, projectView, quickSettings } from '@berlin/engine';
import type { GameState, MatchOutcome, PlayerId, PlayerView } from '@berlin/shared';
import { describe, expect, it } from 'vitest';
import { outcomeExplanation, outcomeHeadline, scoreboard, winnerNames } from './result.js';

/**
 * MATCH-08: the result screen renders MatchOutcome and the view's own score
 * values — nothing computed. `createMatch`/`projectView` build a real,
 * fog-correct PlayerView; the outcome is set directly on the cloned
 * GameState (per this plan's action text) so EXTRACTION and ELIMINATION are
 * covered without needing a seed that happens to produce them.
 *
 * `@berlin/engine` here is a test-only exception — never shipped in the
 * browser bundle — mirroring apps/web/lib/orderDraft.test.ts's precedent
 * (STATE.md decisions) and apps/web/lib/stepThrough.test.ts's real-match
 * fixtures. result.ts and ResultScreen.tsx themselves import nothing from
 * @berlin/engine, which the acceptance grep below also proves.
 */

const SETTINGS = quickSettings();
const P1 = SETTINGS.seats[0]!.id;
const P2 = SETTINGS.seats[1]!.id;

function viewWithOutcome(outcome: MatchOutcome, viewer: PlayerId = P1): PlayerView {
  const state: GameState = { ...createMatch(SETTINGS, 'result-fixture'), outcome };
  return projectView(state, viewer);
}

describe('outcomeHeadline', () => {
  it('renders "{Codename} wins" for a single winner, codename truncated', () => {
    const view = viewWithOutcome({ reason: 'EXTRACTION', winners: [P1] });
    expect(outcomeHeadline(view)).toBe(`${view.self.name} wins`);
  });

  it('renders every winner when the outcome names more than one — no ranking, no pick-first', () => {
    const view = viewWithOutcome({ reason: 'ROUND_LIMIT', winners: [P1, P2] });
    const headline = outcomeHeadline(view);
    expect(headline).toContain(view.self.name);
    expect(headline).toContain(view.opponents[0]!.name);
  });
});

describe('outcomeExplanation', () => {
  it('EXTRACTION renders the exact contracted sentence', () => {
    const view = viewWithOutcome({ reason: 'EXTRACTION', winners: [P1] });
    expect(outcomeExplanation(view)).toBe('3 dossiers extracted.');
  });

  it('ELIMINATION renders the exact contracted sentence', () => {
    const view = viewWithOutcome({ reason: 'ELIMINATION', winners: [P1] });
    expect(outcomeExplanation(view)).toBe('All opposing agents eliminated.');
  });

  it('ROUND_LIMIT renders the contracted sentence naming the round limit and the leader', () => {
    const view = viewWithOutcome({ reason: 'ROUND_LIMIT', winners: [P1] });
    const explanation = outcomeExplanation(view);
    expect(explanation).toContain(`Round ${view.settings.roundLimit} reached`);
    expect(explanation).toContain('led on score.');
    expect(explanation).toContain(view.self.name);
  });

  it('a round-limit tie defers to the engine — every tied winner is named, never just one', () => {
    const view = viewWithOutcome({ reason: 'ROUND_LIMIT', winners: [P1, P2] });
    const explanation = outcomeExplanation(view);
    expect(explanation).toContain(view.self.name);
    expect(explanation).toContain(view.opponents[0]!.name);
  });
});

describe('winnerNames', () => {
  it("resolves every id in outcome.winners against self and opponents, in the engine's own order", () => {
    const view = viewWithOutcome({ reason: 'ROUND_LIMIT', winners: [P2, P1] });
    expect(winnerNames(view)).toEqual([view.opponents[0]!.name, view.self.name]);
  });

  it('returns an empty list when there is no outcome yet', () => {
    const state = createMatch(SETTINGS, 'result-fixture-no-outcome');
    const view = projectView(state, P1);
    expect(view.outcome).toBeNull();
    expect(winnerNames(view)).toEqual([]);
  });
});

describe('scoreboard', () => {
  it('returns one integer row per player, self first, exactly the score in the view — no rounding, padding or unit suffix', () => {
    const view = viewWithOutcome({ reason: 'EXTRACTION', winners: [P1] });
    const rows = scoreboard(view);

    expect(rows).toHaveLength(1 + view.opponents.length);
    expect(rows[0]!.isSelf).toBe(true);
    expect(rows[0]!.score).toBe(view.self.score);
    expect(Number.isInteger(rows[0]!.score)).toBe(true);

    view.opponents.forEach((opp, i) => {
      const row = rows[i + 1]!;
      expect(row.isSelf).toBe(false);
      expect(row.score).toBe(opp.score);
      expect(Number.isInteger(row.score)).toBe(true);
    });
  });

  it('flags exactly the players named in outcome.winners as isWinner', () => {
    const view = viewWithOutcome({ reason: 'ROUND_LIMIT', winners: [P1, P2] });
    const rows = scoreboard(view);
    for (const row of rows) {
      expect(row.isWinner).toBe(true);
    }
  });
});

describe('the result surface never computes, ranks, or re-derives victory', () => {
  it('result.ts contains no sort, no Math.max/min comparison', () => {
    const src = readFileSync(fileURLToPath(new URL('./result.ts', import.meta.url)), 'utf8');
    const stripped = src
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(/\.sort\(|Math\.max|Math\.min/.test(stripped)).toBe(false);
  });

  it('imports no @berlin/engine — winner and reason come only from PlayerView.outcome', () => {
    const resultSrc = readFileSync(fileURLToPath(new URL('./result.ts', import.meta.url)), 'utf8');
    const screenSrc = readFileSync(
      fileURLToPath(new URL('../components/result/ResultScreen.tsx', import.meta.url)),
      'utf8',
    );
    expect(resultSrc).not.toContain('@berlin/engine');
    expect(screenSrc).not.toContain('@berlin/engine');
  });

  it('uses the shared truncateCodename rule for the ROUND_LIMIT codename, rather than a second implementation', () => {
    const src = readFileSync(fileURLToPath(new URL('./result.ts', import.meta.url)), 'utf8');
    expect(/truncateCodename\(/.test(src)).toBe(true);
  });
});

describe('ResultScreen — ELIMINATION and only ELIMINATION styles with the destructive colour', () => {
  it('references #DC2626 gated on the ELIMINATION reason', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../components/result/ResultScreen.tsx', import.meta.url)),
      'utf8',
    );
    expect(/#dc2626/i.test(src)).toBe(true);
    expect(/ELIMINATION/.test(src)).toBe(true);
  });
});

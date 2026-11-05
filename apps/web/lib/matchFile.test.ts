import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Static-source checks — this codebase ships no React component-testing
 * stack (matchChatMount.test.ts's established precedent), so mounting and
 * convention rules are verified by reading the component source.
 *
 * v1.1 replaced Phase 4's bottom-left Intel drawer with the match file: a
 * tabbed panel under the map (Intercepts / History / Legend), plus the
 * personnel roster beside it. These tests pin the same guarantees the
 * drawer's tests did — history is reachable in play and on the result
 * screen, and it renders through the one shared StepThrough — at the new
 * mount points.
 */

const fileSrc = readFileSync(
  fileURLToPath(new URL('../components/match/MatchFile.tsx', import.meta.url)),
  'utf8',
);
const panelSrc = readFileSync(
  fileURLToPath(new URL('../components/resolution/RoundHistoryPanel.tsx', import.meta.url)),
  'utf8',
);
const pageSrc = readFileSync(
  fileURLToPath(new URL('../app/match/[code]/page.tsx', import.meta.url)),
  'utf8',
);

describe('MatchFile.tsx — tabs', () => {
  it('offers the signals log, the round history and the legend', () => {
    expect(fileSrc).toContain("'Intercepts'");
    expect(fileSrc).toContain("'History'");
    expect(fileSrc).toContain("'Legend'");
    expect((fileSrc.match(/<SignalsLog\b/g) ?? []).length).toBe(1);
    expect((fileSrc.match(/<RoundHistoryPanel\b/g) ?? []).length).toBe(1);
  });

  it('feeds history from view.history and never from a re-filtered log', () => {
    expect(fileSrc).toContain('history={view.history}');
    expect(fileSrc).not.toContain('filterEvents');
  });

  it('is a real tablist: role="tab", aria-selected and a labelled tabpanel', () => {
    expect(fileSrc).toContain('role="tablist"');
    expect(fileSrc).toContain('role="tab"');
    expect(fileSrc).toContain('aria-selected');
    expect(fileSrc).toContain('role="tabpanel"');
  });
});

describe('RoundHistoryPanel.tsx — empty state and reduced-motion conventions', () => {
  it('contains the two empty-state strings verbatim from the Copywriting Contract', () => {
    expect(panelSrc).toContain('No rounds yet');
    expect(panelSrc).toContain('History fills in once your first round resolves.');
  });

  it('imports fadeSlideUpVariant rather than declaring its own reduced-motion branch', () => {
    expect(/import\s*\{[^}]*fadeSlideUpVariant[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/motion\.js['"]/.test(
      panelSrc,
    )).toBe(true);
  });

  it('calls useReducedMotion exactly once', () => {
    expect((panelSrc.match(/useReducedMotion\(\)/g) ?? []).length).toBe(1);
  });
});

describe('apps/web/app/match/[code]/page.tsx — match file and roster mount points (static)', () => {
  it('mounts <MatchFile twice — once in the live-play branch, once in the result-screen branch — both after `if (!view) {`', () => {
    const occurrences = (pageSrc.match(/<MatchFile\b/g) ?? []).length;
    expect(occurrences).toBe(2);

    const noViewIndex = pageSrc.indexOf('if (!view) {');
    expect(noViewIndex).toBeGreaterThan(-1);
    let searchFrom = 0;
    for (let i = 0; i < occurrences; i++) {
      const mountIndex = pageSrc.indexOf('<MatchFile', searchFrom);
      expect(mountIndex).toBeGreaterThan(noViewIndex);
      searchFrom = mountIndex + 1;
    }
  });

  it('keeps the roster on the result screen too, after ResultScreen', () => {
    const resultScreenIndex = pageSrc.indexOf('<ResultScreen');
    expect(resultScreenIndex).toBeGreaterThan(-1);
    expect(pageSrc.indexOf('<RosterPanel', resultScreenIndex)).toBeGreaterThan(resultScreenIndex);
  });

  it('no longer mounts the retired v1.0 drawer', () => {
    expect(pageSrc).not.toContain('MatchIntelDrawer');
  });
});

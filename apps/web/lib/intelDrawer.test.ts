import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Static-source checks — this codebase ships no React component-testing
 * stack (<testing_note> at the top of the plan; matchChatMount.test.ts's
 * established precedent), so conventions like "docks bottom-left, never
 * bottom-right" or "calls useReducedMotion exactly once" are verified by
 * reading the component source rather than rendering it.
 */

const drawerSrc = readFileSync(
  fileURLToPath(new URL('../components/match/MatchIntelDrawer.tsx', import.meta.url)),
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

describe('MatchIntelDrawer.tsx — corner dock conventions', () => {
  it('docks bottom-left, never bottom-right — so it cannot overlap MatchChat', () => {
    expect(drawerSrc).toContain('bottom-4 left-4');
    // MatchChat's dock class — must never appear in the Intel drawer's source.
    expect(drawerSrc).not.toContain('bottom-4 right-4');
  });

  it('reuses MatchChat\'s expanded dimensions and padding (h-96, w-80, p-6)', () => {
    expect(drawerSrc).toContain('h-96');
    expect(drawerSrc).toContain('w-80');
    expect(drawerSrc).toContain('p-6');
  });

  it('the collapsed toggle carries the 44px hit-target rule (min-h-11 min-w-11)', () => {
    expect(drawerSrc).toContain('min-h-11 min-w-11');
  });

  it('imports fadeSlideUpVariant from the shared motion module', () => {
    expect(/import\s*\{[^}]*fadeSlideUpVariant[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/motion\.js['"]/.test(
      drawerSrc,
    )).toBe(true);
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

describe('apps/web/app/match/[code]/page.tsx — MatchIntelDrawer mount points (static)', () => {
  it('mounts <MatchIntelDrawer twice — once in the live-play branch, once in the result-screen branch — both after `if (!view) {`', () => {
    const occurrences = (pageSrc.match(/<MatchIntelDrawer\b/g) ?? []).length;
    expect(occurrences).toBe(2);

    const noViewIndex = pageSrc.indexOf('if (!view) {');
    expect(noViewIndex).toBeGreaterThan(-1);

    let searchFrom = 0;
    for (let i = 0; i < occurrences; i++) {
      const mountIndex = pageSrc.indexOf('<MatchIntelDrawer', searchFrom);
      expect(mountIndex).toBeGreaterThan(noViewIndex);
      searchFrom = mountIndex + 1;
    }
  });

  it('one mount sits inside the result-screen branch (after ResultScreen), the other after MatchChat in the live-play branch', () => {
    const resultScreenIndex = pageSrc.indexOf('<ResultScreen');
    const matchChatIndex = pageSrc.indexOf('<MatchChat');
    expect(resultScreenIndex).toBeGreaterThan(-1);
    expect(matchChatIndex).toBeGreaterThan(-1);

    const firstDrawerAfterResult = pageSrc.indexOf('<MatchIntelDrawer', resultScreenIndex);
    const firstDrawerAfterChat = pageSrc.indexOf('<MatchIntelDrawer', matchChatIndex);
    expect(firstDrawerAfterResult).toBeGreaterThan(resultScreenIndex);
    expect(firstDrawerAfterChat).toBeGreaterThan(matchChatIndex);
  });
});

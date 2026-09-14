import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * D-08 / POLISH-01 — this file covers *adoption* of the shared motion
 * utility across the app (every component that should route through
 * `apps/web/lib/motion.ts` actually does), while `apps/web/lib/motion.test.ts`
 * covers the utility's own behaviour. Static-source checks, following
 * `apps/web/lib/matchChatMount.test.ts`'s `readFileSync` + `fileURLToPath`
 * convention — this codebase ships no React component-testing stack.
 */

function readSrc(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const SHARED_MOTION_IMPORT = /from\s*['"]\.\.\/\.\.\/lib\/motion\.js['"]/;

function importsFrom(src: string, symbol: string): boolean {
  const re = new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*['"]\\.\\.\\/\\.\\.\\/lib\\/motion\\.js['"]`);
  return re.test(src);
}

const pageTransitionSrc = readSrc('../components/ui/PageTransition.tsx');
const buttonSrc = readSrc('../components/ui/Button.tsx');
const homePageSrc = readSrc('../app/page.tsx');
const deckPageSrc = readSrc('../app/deck/page.tsx');
const lobbyPageSrc = readSrc('../app/lobby/[code]/page.tsx');
const matchPageSrc = readSrc('../app/match/[code]/page.tsx');
const stepThroughSrc = readSrc('../components/resolution/StepThrough.tsx');
const matchChatSrc = readSrc('../components/match/MatchChat.tsx');
const drawerSrc = readSrc('../components/match/MatchIntelDrawer.tsx');
const cardGridSrc = readSrc('../components/deck/CardGrid.tsx');

/**
 * The seven components this phase routes through the shared motion utility.
 * A real array, not a hand-counted list — adding a component to it later is
 * a one-line change, which is the mechanism keeping D-08 true after this
 * phase ends (Task 2 acceptance criteria).
 */
const ANIMATED_COMPONENT_PATHS = [
  '../components/resolution/StepThrough.tsx',
  '../components/resolution/RoundHistoryPanel.tsx',
  '../components/intel/BurnTrackPanel.tsx',
  '../components/match/MatchIntelDrawer.tsx',
  '../components/match/MatchChat.tsx',
  '../components/deck/CardGrid.tsx',
  '../components/ui/PageTransition.tsx',
];

describe('PageTransition.tsx', () => {
  it('carries the client directive', () => {
    expect(pageTransitionSrc.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports fadeSlideUpVariant and useReducedMotion', () => {
    expect(importsFrom(pageTransitionSrc, 'fadeSlideUpVariant')).toBe(true);
    expect(pageTransitionSrc.includes('useReducedMotion')).toBe(true);
  });

  it('exports PageTransition', () => {
    expect(/export function PageTransition/.test(pageTransitionSrc)).toBe(true);
  });
});

describe('Route roots — page-mount entry', () => {
  it('all four route files contain PageTransition', () => {
    for (const src of [homePageSrc, deckPageSrc, lobbyPageSrc, matchPageSrc]) {
      expect(src).toContain('PageTransition');
    }
  });

  it('the home route stays a React Server Component — no client directive', () => {
    expect(homePageSrc.includes("'use client'")).toBe(false);
  });
});

describe('Button.tsx — hover fills', () => {
  it('imports HOVER_TRANSITION_CLASS from the shared motion module', () => {
    expect(importsFrom(buttonSrc, 'HOVER_TRANSITION_CLASS')).toBe(true);
  });

  it('hardcodes no duration literal of its own', () => {
    expect(/duration:\s*[\d.]+/.test(buttonSrc)).toBe(false);
  });

  it('contains the primary and destructive hover fills, gated to enabled buttons only', () => {
    expect(buttonSrc).toContain('enabled:hover:bg-[#1d4ed8]');
    expect(buttonSrc).toContain('enabled:hover:bg-[#b91c1c]');
  });

  it('still contains disabled:opacity-50 — the pending treatment is untouched', () => {
    expect(buttonSrc).toContain('disabled:opacity-50');
  });

  it('imports nothing from @berlin/engine or @berlin/shared', () => {
    expect(/from\s*['"]@berlin\/(engine|shared)['"]/.test(buttonSrc)).toBe(false);
  });
});

describe('StepThrough.tsx — refactored onto the shared motion utility', () => {
  it('imports fadeSlideUpVariant from the shared motion module', () => {
    expect(importsFrom(stepThroughSrc, 'fadeSlideUpVariant')).toBe(true);
  });

  it('still imports useReducedMotion from motion/react', () => {
    expect(stepThroughSrc.includes('useReducedMotion')).toBe(true);
    expect(/from\s*['"]motion\/react['"]/.test(stepThroughSrc)).toBe(true);
  });

  it('no longer contains the inline ternary form', () => {
    // planner-discipline-allow: reducedMotion ? false
    expect(stepThroughSrc.includes('reducedMotion ? false')).toBe(false);
  });

  it('contains no bare duration: 0.25 literal', () => {
    expect(/duration:\s*0\.25\b/.test(stepThroughSrc)).toBe(false);
  });
});

describe('Cross-file — one reduced-motion code path (D-08, T-04-16)', () => {
  const sources = ANIMATED_COMPONENT_PATHS.map((path) => ({ path, src: readSrc(path) }));

  it('every file calling useReducedMotion also imports from the shared motion module', () => {
    for (const { path, src } of sources) {
      if (/useReducedMotion\(\)/.test(src)) {
        expect(SHARED_MOTION_IMPORT.test(src), `${path} calls useReducedMotion but has no shared-motion import`).toBe(
          true,
        );
      }
    }
  });

  it('the inline ternary form appears zero times across the animated file set', () => {
    // planner-discipline-allow: reducedMotion ? false
    for (const { path, src } of sources) {
      expect(src.includes('reducedMotion ? false'), `${path} still contains the inline ternary`).toBe(false);
    }
  });
});

describe('MatchChat.tsx', () => {
  it('imports fadeSlideUpVariant', () => {
    expect(importsFrom(matchChatSrc, 'fadeSlideUpVariant')).toBe(true);
  });

  it('no longer defers its transition pass to a later phase', () => {
    expect(matchChatSrc.includes("POLISH-01's transition pass is Phase 4")).toBe(false);
  });
});

describe('CardGrid.tsx', () => {
  it('imports cardFlipVariant', () => {
    expect(importsFrom(cardGridSrc, 'cardFlipVariant')).toBe(true);
  });

  it('calls useReducedMotion exactly once for the whole grid, not once per tile', () => {
    expect((cardGridSrc.match(/useReducedMotion\(\)/g) ?? []).length).toBe(1);
  });
});

describe('MatchChat.tsx and MatchIntelDrawer.tsx toggle buttons', () => {
  it('both carry HOVER_TRANSITION_CLASS', () => {
    expect(matchChatSrc.includes('HOVER_TRANSITION_CLASS')).toBe(true);
    expect(drawerSrc.includes('HOVER_TRANSITION_CLASS')).toBe(true);
  });
});

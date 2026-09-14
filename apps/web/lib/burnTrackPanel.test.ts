import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { BurnEntry } from '@berlin/shared';
import { BURN_TRACK_COPY, SECTOR_SWATCH, burnEntryLabel } from './burnTrack.js';

/**
 * Real behavioural tests for `burnEntryLabel` (a pure function of a
 * `BurnEntry`, node-testable per this plan's <testing_note>). Static-source
 * assertions over `BurnTrackPanel.tsx` and `MatchIntelDrawer.tsx` are added
 * by Task 2, once those components exist — this repo ships no React
 * component-testing stack (01-02-PLAN.md's precedent), so component
 * conventions are pinned by reading source, exactly as
 * `matchChatMount.test.ts` does.
 */

function makeEntry(overrides: Partial<BurnEntry> = {}): BurnEntry {
  return {
    round: 4,
    cardId: 'wiretap' as never,
    icon: 'WIRETAP',
    sector: 'BLUE',
    kind: 'ACTIVE',
    effect: null,
    ...overrides,
  };
}

describe('apps/web/lib/burnTrack.ts burnEntryLabel (real behavior)', () => {
  it('renders the three-segment form for a non-redacted entry', () => {
    const entry = makeEntry({ round: 4, icon: 'WIRETAP', sector: 'BLUE' });
    expect(burnEntryLabel(entry)).toBe('WIRETAP · BLUE · Round 4');
  });

  it('renders the two-segment form for a redacted entry — no empty segment, no doubled separator, no extra word', () => {
    const entry = makeEntry({ round: 4, icon: 'WIRETAP', sector: null });
    expect(burnEntryLabel(entry)).toBe('WIRETAP · Round 4');
  });

  it('the redacted label is strictly shorter than the same entry with a sector', () => {
    const withSector = makeEntry({ round: 4, icon: 'WIRETAP', sector: 'BLUE' });
    const redacted = makeEntry({ round: 4, icon: 'WIRETAP', sector: null });
    expect(burnEntryLabel(redacted).length).toBeLessThan(burnEntryLabel(withSector).length);
  });

  it('is a pure function of its argument — repeat calls return the same string and never mutate the entry', () => {
    const entry = makeEntry({ round: 7, icon: 'SIGNAL', sector: 'GOLD' });
    const snapshot = { ...entry };
    const first = burnEntryLabel(entry);
    const second = burnEntryLabel(entry);
    expect(first).toBe(second);
    expect(entry).toEqual(snapshot);
  });
});

describe('apps/web/lib/burnTrack.ts SECTOR_SWATCH', () => {
  it("has exactly the four sector keys, matching CardGrid.tsx's existing palette", () => {
    const cardGridPath = fileURLToPath(new URL('../components/deck/CardGrid.tsx', import.meta.url));
    const cardGridSource = readFileSync(cardGridPath, 'utf8');

    expect(Object.keys(SECTOR_SWATCH).sort()).toEqual(['BLUE', 'GOLD', 'GREEN', 'RED']);
    expect(SECTOR_SWATCH.RED).toBe('#dc2626');
    expect(SECTOR_SWATCH.BLUE).toBe('#2563eb');
    expect(SECTOR_SWATCH.GOLD).toBe('#ca8a04');
    expect(SECTOR_SWATCH.GREEN).toBe('#16a34a');

    // Cross-check against the source values CardGrid.tsx actually uses, so
    // this test fails if the two palettes ever drift apart.
    expect(cardGridSource).toContain("RED: '#dc2626'");
    expect(cardGridSource).toContain("BLUE: '#2563eb'");
    expect(cardGridSource).toContain("GOLD: '#ca8a04'");
    expect(cardGridSource).toContain("GREEN: '#16a34a'");
  });
});

describe('apps/web/lib/burnTrack.ts BURN_TRACK_COPY', () => {
  it('carries the exact title, subtitle, and empty-state strings from 04-UI-SPEC.md', () => {
    expect(BURN_TRACK_COPY.title).toBe('Burn Track');
    expect(BURN_TRACK_COPY.subtitle).toBe('What opponents have learned about you.');
    expect(BURN_TRACK_COPY.emptyHeading).toBe('No entries yet');
    expect(BURN_TRACK_COPY.emptyBody).toBe(
      'Your capability profile appears here the first time you play a card or a passive fires.',
    );
  });
});

describe('apps/web/lib/burnTrack.ts module conventions (static)', () => {
  it('imports no framework — no "use client", no react import', () => {
    const path = fileURLToPath(new URL('./burnTrack.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect((source.match(/use client/g) ?? []).length).toBe(0);
    expect((source.match(/react/gi) ?? []).length).toBe(0);
  });
});

describe('apps/web/components/intel/BurnTrackPanel.tsx (static)', () => {
  const path = fileURLToPath(new URL('../components/intel/BurnTrackPanel.tsx', import.meta.url));
  const source = readFileSync(path, 'utf8');

  it('imports burnEntryLabel from the shared module and builds no entry string of its own', () => {
    expect(source).toContain('burnEntryLabel');
    expect(source).toMatch(/from ['"]\.\.\/\.\.\/lib\/burnTrack\.js['"]/);
  });

  it('guards the swatch render on entry.sector being non-null and imports SECTOR_SWATCH', () => {
    expect(source).toContain('SECTOR_SWATCH');
    expect(source).toMatch(/entry\.sector\s*(!==|===)\s*null/);
  });

  it('contains no synthesized suppression tag', () => {
    // planner-discipline-allow: Cutout
    expect(source).not.toMatch(/Cutout|Redact/i);
  });

  it('does not reverse its entry list', () => {
    expect(source).not.toMatch(/\.reverse\(/);
  });

  it('carries both empty-state strings via BURN_TRACK_COPY and calls useReducedMotion exactly once', () => {
    expect(source).toContain('BURN_TRACK_COPY');
    expect((source.match(/useReducedMotion\(/g) ?? []).length).toBe(1);
  });

  it('imports cardFlipVariant, not fadeSlideUpVariant (D-06)', () => {
    expect(source).toContain('cardFlipVariant');
    expect(source).not.toContain('fadeSlideUpVariant');
  });
});

describe('apps/web/components/match/MatchIntelDrawer.tsx Burn Track tab (static)', () => {
  const path = fileURLToPath(new URL('../components/match/MatchIntelDrawer.tsx', import.meta.url));
  const source = readFileSync(path, 'utf8');

  it("renders <BurnTrackPanel exactly once, passing the viewer's own track", () => {
    expect((source.match(/<BurnTrackPanel\b/g) ?? []).length).toBe(1);
  });

  it('reads view.self.id and never iterates view.opponents (D-07: no opponent-track browsing this phase)', () => {
    expect(source).toContain('view.self.id');
    expect(source).not.toContain('view.opponents');
  });

  it('contains both tab labels from the Copywriting Contract', () => {
    expect(source).toContain('History');
    expect(source).toContain('Burn Track');
  });

  it('still docks bottom-4 left-4 at h-96 w-80 p-6', () => {
    expect(source).toContain('bottom-4');
    expect(source).toContain('left-4');
    expect(source).toContain('h-96');
    expect(source).toContain('w-80');
    expect(source).toContain('p-6');
  });
});

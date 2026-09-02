import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A static-source check — this codebase ships no React component-testing
 * stack (01-02-PLAN.md's precedent), so a mounting-location convention like
 * "MatchChat renders exactly once, only in the live-play branch" is
 * verified by reading the route file's source rather than rendering it.
 */
describe('apps/web/app/match/[code]/page.tsx MatchChat mount point (static)', () => {
  it('renders <MatchChat exactly once, after the Orders column closes, outside every early-return branch', () => {
    const path = fileURLToPath(new URL('../app/match/[code]/page.tsx', import.meta.url));
    const source = readFileSync(path, 'utf8');

    expect((source.match(/<MatchChat\b/g) ?? []).length).toBe(1);

    const mountIndex = source.indexOf('<MatchChat');
    expect(mountIndex).toBeGreaterThan(-1);

    // Every early-return block (connection lost, no view yet, outcome
    // reached) closes its own <main> before MatchChat's mount point — so
    // the last occurrence of each early-return's distinguishing string must
    // appear strictly before the mount point.
    const lostIndex = source.indexOf("connectionStatus === 'lost'");
    const noViewIndex = source.indexOf('if (!view) {');
    const outcomeIndex = source.indexOf('view.outcome !== null');
    expect(lostIndex).toBeGreaterThan(-1);
    expect(noViewIndex).toBeGreaterThan(-1);
    expect(outcomeIndex).toBeGreaterThan(-1);
    expect(lostIndex).toBeLessThan(mountIndex);
    expect(noViewIndex).toBeLessThan(mountIndex);
    expect(outcomeIndex).toBeLessThan(mountIndex);

    // The Orders column's own closing </div> — the md:w-2/5 wrapper —
    // must close before MatchChat mounts alongside it, as a sibling, not a
    // child.
    const ordersCloseIndex = source.lastIndexOf('</div>', mountIndex);
    expect(ordersCloseIndex).toBeGreaterThan(-1);
    expect(ordersCloseIndex).toBeLessThan(mountIndex);
  });
});

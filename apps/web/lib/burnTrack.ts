import type { BurnEntry, Sector } from '@berlin/shared';

/**
 * MATCH-07: pure Burn Track formatting — entry labels and copy constants,
 * no client framework and no animation-library import, so the
 * node-environment vitest run (apps/web's testing_note) can import and
 * exercise this module directly.
 *
 * Deliberately not `format.ts`: that module's own header scopes it to
 * resolution-*event* prose (the visual log and the screen-reader
 * announcement). A `BurnEntry` is not a `ResolutionEvent` — it's a row on a
 * public capability ledger (`docs/GAME_DESIGN.md` §6.3), so it gets its own
 * home in `lib/`, alongside `chatRows.ts` and `seatRows.ts`. Keeping it
 * separate also lets Plan 04-02 own `format.ts` in the same wave without a
 * file conflict.
 */

/** 02-UI-SPEC.md's fixed four-color palette, copied verbatim from
 *  `apps/web/components/deck/CardGrid.tsx` — a sector swatch is always
 *  paired with its uppercase text label, never color alone
 *  (apps/web/components/CLAUDE.md). */
export const SECTOR_SWATCH: Record<Sector, string> = {
  RED: '#dc2626',
  BLUE: '#2563eb',
  GOLD: '#ca8a04',
  GREEN: '#16a34a',
};

/** 04-UI-SPEC.md's Copywriting Contract, verbatim. */
export const BURN_TRACK_COPY = Object.freeze({
  title: 'Burn Track',
  subtitle: 'What opponents have learned about you.',
  emptyHeading: 'No entries yet',
  emptyBody: 'Your capability profile appears here the first time you play a card or a passive fires.',
});

/**
 * One entry's display text: `{Icon} · {Sector} · Round {N}`, or
 * `{Icon} · Round {N}` when `entry.sector` is null.
 *
 * The `sector === null` branch is the whole point of this function. That
 * value is the engine's already-made decision — Cutout's redaction is
 * applied once, at append time, in `packages/engine/src/resolution/ctx.ts`
 * (`appendBurn`) — and this module trusts it as a signal rather than
 * deciding anything itself (D-05). A suppressed entry renders as the
 * *absence* of the sector segment and nothing more: no label, no tag, no
 * em dash, no neutral swatch, no tooltip. The player is meant to deduce
 * something from noticing that absence; adding any word in its place
 * destroys exactly the mechanic Cutout exists to create.
 *
 * Segments are filtered then joined so the two-segment form falls out of
 * the same code path as the three-segment one and cannot drift apart.
 */
export function burnEntryLabel(entry: BurnEntry): string {
  const segments = [entry.icon, entry.sector, `Round ${entry.round}`].filter(
    (segment): segment is string => segment !== null,
  );
  return segments.join(' · ');
}

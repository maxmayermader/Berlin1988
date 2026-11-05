'use client';

import type { BurnEntry } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import { BURN_TRACK_COPY, SECTOR_SWATCH, burnEntryLabel, burnTrackSubtitleFor } from '../../lib/burnTrack.js';
import { cardFlipVariant } from '../../lib/motion.js';
import { SectorGlyph } from './SectorGlyph.js';

export interface BurnTrackPanelProps {
  /** One player's track, already sliced to `view.burnTracks[playerId]` by
   *  the caller — this component takes the array, never the whole
   *  `PlayerView`. Every track is public and identically graded
   *  (docs/GAME_DESIGN.md §6.3), so the same component renders the
   *  viewer's own track and any opponent's (BURN-05). */
  entries: readonly BurnEntry[];
  /** Whose track this is, for the subtitle. */
  ownerName?: string;
  isSelf?: boolean;
  /** Hide the heading block when the caller already titles the panel. */
  compact?: boolean;
}

/**
 * A player's Burn Track — a capability profile, not an exhaustion counter.
 * Each entry independently checks `entry.sector === null` and renders one
 * of the two label forms; a track is never rendered as wholly suppressed or
 * wholly public. The viewer's own track renders exactly as opponents see it
 * (apps/web/components/CLAUDE.md), with no owner-only extras.
 */
export function BurnTrackPanel({ entries, ownerName = 'you', isSelf = true, compact = false }: BurnTrackPanelProps) {
  const reducedMotion = useReducedMotion();

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        {!compact && <h3 className="font-display text-lg leading-tight">{BURN_TRACK_COPY.emptyHeading}</h3>}
        <p className="text-sm text-ink-muted">
          {isSelf ? BURN_TRACK_COPY.emptyBody : `No cards on record for ${ownerName} yet.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display text-lg leading-tight">{BURN_TRACK_COPY.title}</h3>
          <p className="text-sm text-ink-muted">{burnTrackSubtitleFor(ownerName, isSelf)}</p>
        </div>
      )}
      {/* Oldest-to-newest — matches appendBurn()'s own append order
          (packages/engine/src/resolution/ctx.ts). Never reversed. */}
      <ol className="flex flex-wrap gap-1.5">
        {entries.map((entry, index) => (
          <motion.li
            key={index}
            {...cardFlipVariant(reducedMotion)}
            className="paper flex items-center gap-1.5 rounded-[2px] border border-rule px-2 py-1 text-xs font-bold shadow-[1px_1px_0_0_var(--color-rule)]"
            style={entry.sector !== null ? { borderLeft: `4px solid ${SECTOR_SWATCH[entry.sector]}` } : undefined}
          >
            {entry.sector !== null && <SectorGlyph sector={entry.sector} size={11} />}
            <span>{burnEntryLabel(entry)}</span>
            {entry.kind === 'PASSIVE' && (
              <span className="label-caps rounded-[2px] bg-ink px-1 text-[0.6rem] text-paper">passive</span>
            )}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

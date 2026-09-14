'use client';

import type { BurnEntry } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import { BURN_TRACK_COPY, SECTOR_SWATCH, burnEntryLabel } from '../../lib/burnTrack.js';
import { cardFlipVariant } from '../../lib/motion.js';

export interface BurnTrackPanelProps {
  /** The viewer's own track, already sliced to
   *  `view.burnTracks[view.self.id]` by the caller — this component takes
   *  the array, never the whole `PlayerView`, so it structurally cannot
   *  reach another player's track (D-07). */
  entries: readonly BurnEntry[];
}

/**
 * MATCH-07 (D-04/D-05/D-06/D-07): the viewer's own Burn Track, rendered
 * exactly as opponents see it (`docs/GAME_DESIGN.md` §6.3) — a capability
 * profile, not an exhaustion counter. Each entry independently checks
 * `entry.sector === null` and renders one of the two label forms; a track
 * is never rendered as wholly suppressed or wholly public.
 */
export function BurnTrackPanel({ entries }: BurnTrackPanelProps) {
  const reducedMotion = useReducedMotion();

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-[20px] font-semibold leading-[1.2]">{BURN_TRACK_COPY.emptyHeading}</h3>
        <p className="text-base text-[#64748b]">{BURN_TRACK_COPY.emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-[20px] font-semibold leading-[1.2]">{BURN_TRACK_COPY.title}</h3>
        <p className="text-sm text-[#64748b]">{BURN_TRACK_COPY.subtitle}</p>
      </div>
      {/* Oldest-to-newest — matches appendBurn()'s own append order
          (packages/engine/src/resolution/ctx.ts). Never reversed. */}
      <ul className="flex-1 overflow-y-auto flex flex-col gap-2">
        {entries.map((entry, index) => (
          <motion.li
            key={index}
            {...cardFlipVariant(reducedMotion)}
            className="flex items-center gap-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-base"
          >
            {entry.sector !== null && (
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: SECTOR_SWATCH[entry.sector] }}
              />
            )}
            {burnEntryLabel(entry)}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

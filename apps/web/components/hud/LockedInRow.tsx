'use client';

import type { PlayerView } from '@berlin/shared';
import { truncateCodename } from '../../lib/format.js';
import { useMatchStore } from '../../lib/matchStore.js';

export interface LockedInRowProps {
  view: PlayerView;
}

/** Matches `SEAT_COUNT` in apps/party/src/state.ts — the room always
 *  creates four seats and fills every one (human or bot) before a match
 *  starts, so this is also `view.settings.seats.length` in practice. Fixed
 *  here rather than derived so the row's shape never depends on how many
 *  seats happen to be filled. */
const SLOT_COUNT = 4;

/**
 * A fixed four-slot row — always four, whatever the seat count — so it
 * never reflows as players submit in arbitrary order. Occupied slots show
 * the seat's codename and a locked-in badge once that seat's committed
 * count equals its live agent count, read from the same content-free
 * `matchStore.committed` map SubmittedCount reads (T-1-13: neither
 * component accepts a prop that could carry order content, because no such
 * value exists in the store).
 */
export function LockedInRow({ view }: LockedInRowProps) {
  const committed = useMatchStore((s) => s.committed);
  const seats = view.settings.seats;

  return (
    <div className="flex gap-2" role="list" aria-label="Locked-in players">
      {Array.from({ length: SLOT_COUNT }, (_, index) => {
        const seat = seats[index];
        if (!seat) {
          return (
            <div
              key={index}
              aria-hidden="true"
              className="h-8 w-20 rounded border border-dashed border-[#e2e8f0]"
            />
          );
        }
        const c = committed[seat.id as string];
        const lockedIn = c !== undefined && c.total > 0 && c.committed >= c.total;
        return (
          <div
            key={index}
            role="listitem"
            className="flex h-8 min-w-20 items-center justify-center gap-1 rounded border border-[#e2e8f0] px-2 text-xs"
          >
            <span className="truncate">{truncateCodename(seat.name)}</span>
            {seat.kind === 'BOT' && (
              <span className="rounded border border-[#e2e8f0] px-1 text-[10px] font-semibold uppercase text-[#64748b]">
                AI
              </span>
            )}
            {lockedIn && (
              <span aria-label="Locked in" className="font-semibold text-[#2563eb]">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

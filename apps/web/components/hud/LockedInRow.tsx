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
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Locked-in players">
      {Array.from({ length: SLOT_COUNT }, (_, index) => {
        const seat = seats[index];
        if (!seat) {
          return (
            <div
              key={index}
              aria-hidden="true"
              className="h-7 w-16 rounded-[2px] border border-dashed border-on-desk-muted/30"
            />
          );
        }
        const c = committed[seat.id as string];
        const lockedIn = c !== undefined && c.total > 0 && c.committed >= c.total;
        return (
          <div
            key={index}
            role="listitem"
            className={`flex h-7 min-w-16 items-center justify-center gap-1 rounded-[2px] border px-2 text-xs ${
              lockedIn ? 'border-ok bg-ok-wash text-ok' : 'border-on-desk-muted/40 text-on-desk'
            }`}
          >
            <span className="max-w-[9rem] truncate">{truncateCodename(seat.name)}</span>
            {seat.kind === 'BOT' && (
              <span className="label-caps rounded-[2px] border border-current/50 px-0.5 text-[0.55rem] opacity-80">
                AI
              </span>
            )}
            {lockedIn && (
              <span aria-label="Locked in" className="font-bold">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

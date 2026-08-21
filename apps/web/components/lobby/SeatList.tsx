'use client';

import type { LobbySeat } from '@berlin/shared';

export interface SeatListProps {
  seats: readonly LobbySeat[];
  onToggleReady: () => void;
  /** The local player's own playerId, if known — only this row is
   *  interactive. Optional so the component still renders sanely before
   *  JOINED has arrived. */
  myPlayerId?: string | null;
}

/**
 * One row per seat, in array order — apps/party/src/state.ts assigns seat
 * order once at join time and never re-sorts it. Takes seats and a
 * ready-toggle callback as props; performs no network access
 * (apps/web/components/CLAUDE.md).
 */
export function SeatList({ seats, onToggleReady, myPlayerId = null }: SeatListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {seats.map((seat) => (
        <li
          key={seat.index}
          className="rounded border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2 text-base"
        >
          {seat.kind === 'OPEN' ? (
            <>
              <span className="font-semibold">Open Seat</span>
              <span className="block text-sm">
                An AI opponent will join when the match starts.
              </span>
            </>
          ) : seat.playerId === myPlayerId ? (
            <button
              type="button"
              onClick={onToggleReady}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <SeatRowBody seat={seat} />
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <SeatRowBody seat={seat} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SeatRowBody({ seat }: { seat: LobbySeat }) {
  return (
    <>
      <span className="truncate">
        {seat.codename}
        {seat.kind === 'BOT' && (
          <span className="ml-2 rounded border border-[#e2e8f0] px-1 text-xs font-semibold uppercase text-[#64748b]">
            AI
          </span>
        )}
      </span>
      <span className={seat.ready ? 'font-semibold text-[#2563eb]' : 'text-[#64748b]'}>
        {seat.ready ? 'Ready ✓' : 'Not ready'}
      </span>
    </>
  );
}

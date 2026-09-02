'use client';

import type { LobbySnapshot } from '@berlin/shared';
import { useState } from 'react';
import { READY_BADGE_TEXT, seatRows, type SeatRow } from '../../lib/seatRows.js';
import { Button } from '../ui/Button.js';

export interface SeatListProps {
  snapshot: LobbySnapshot;
  onToggleReady: () => void;
  /** The local player's own playerId, if known — only this row is
   *  interactive. Optional so the component still renders sanely before
   *  JOINED has arrived. Also the viewer identity passed into seatRows()
   *  for canKick — host-only visibility is a seatRows rule, not something
   *  this component re-derives (03-CONTEXT.md D-06, seatRows.ts's own
   *  header comment). */
  myPlayerId?: string | null;
  /** Sends a KICK for this row's seat index. Optional — omitted, every
   *  row's canKick is already false (seatRows' null-viewer default), so no
   *  Kick button renders and this prop is simply never called. */
  onKick?: (seatIndex: number) => void;
}

/**
 * Renders seatRows(snapshot, viewer) — the pure view model owns every rule
 * (badge text, AI labelling, row order, kick-button visibility); this
 * component decides nothing (apps/web/components/CLAUDE.md, this plan's
 * <testing_note>). The open-seat heading and body stay as literals here —
 * they are layout copy for a row that has no data to derive from.
 */
export function SeatList({ snapshot, onToggleReady, myPlayerId = null, onKick }: SeatListProps) {
  const rows = seatRows(snapshot, { playerId: myPlayerId });
  const [kickingIndex, setKickingIndex] = useState<number | null>(null);

  function handleKickClick(row: SeatRow) {
    if (!onKick) return;
    const confirmed = window.confirm(
      `Kick ${row.label} from the lobby? They can rejoin later using the join code.`,
    );
    if (!confirmed) return;
    setKickingIndex(row.index);
    onKick(row.index);
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.index}
          className="rounded border border-[#e2e8f0] bg-[#f1f5f9] px-4 py-2 text-base"
        >
          {row.kind === 'OPEN' ? (
            <>
              <span className="font-semibold">Open Seat</span>
              <span className="block text-sm">
                An AI opponent will join when the match starts.
              </span>
            </>
          ) : row.playerId === myPlayerId ? (
            <button
              type="button"
              onClick={onToggleReady}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <SeatRowBody row={row} />
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <SeatRowBody row={row} />
              {row.canKick && (
                <Button
                  variant="destructive"
                  pending={kickingIndex === row.index}
                  onClick={() => handleKickClick(row)}
                >
                  Kick
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SeatRowBody({ row }: { row: SeatRow }) {
  return (
    <>
      <span className="truncate">
        {row.label}
        {row.isAi && (
          <span className="ml-2 rounded border border-[#e2e8f0] px-1 text-xs font-semibold uppercase text-[#64748b]">
            AI
          </span>
        )}
      </span>
      <span
        className={row.badgeText === READY_BADGE_TEXT ? 'font-semibold text-[#2563eb]' : 'text-[#64748b]'}
      >
        {row.badgeText}
      </span>
    </>
  );
}

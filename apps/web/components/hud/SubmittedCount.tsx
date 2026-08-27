'use client';

import type { PlayerView } from '@berlin/shared';
import { useMatchStore } from '../../lib/matchStore.js';

export interface SubmittedCountProps {
  view: PlayerView;
}

/**
 * "{N} of {M} submitted" — MATCH-04, T-1-25. Both numbers come from
 * `matchStore.committed`, written only by the server's OPPONENT_COMMITTED
 * broadcast (apps/party/src/broadcast.ts `sendCommitted`, which fans out to
 * every connection including the submitter). N rises only when the room
 * says so; pressing Submit locally never touches this component's inputs.
 *
 * One component for every seat count from 1-of-1 to 4-of-4 — no branch on
 * seat count, bot presence, or solo play. A bot seat's commit lands through
 * the identical sendCommitted() call as a human's and is counted
 * identically here.
 */
export function SubmittedCount({ view }: SubmittedCountProps) {
  const committed = useMatchStore((s) => s.committed);

  const liveSeatIds: string[] = [];
  if (!view.self.eliminated) liveSeatIds.push(view.self.id as string);
  for (const opponent of view.opponents) {
    if (!opponent.eliminated) liveSeatIds.push(opponent.id as string);
  }

  const total = liveSeatIds.length;
  const n = liveSeatIds.filter((id) => {
    const c = committed[id];
    return c !== undefined && c.total > 0 && c.committed >= c.total;
  }).length;

  return (
    <p className="text-sm font-medium text-[#0f172a]">
      {n} of {total} submitted
    </p>
  );
}

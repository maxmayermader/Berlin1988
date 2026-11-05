'use client';

import { useEffect, useState } from 'react';
import { clockLabel, isUrgent, secondsRemaining } from '../../lib/clock.js';

export interface RoundClockProps {
  /** The server's absolute deadline — apps/web/CLAUDE.md rule 6. */
  deadlineAt: number | null;
}

/**
 * The countdown, rendered from `deadlineAt`. The interval controls only
 * *when* the component re-reads the wall clock — the displayed value is
 * always recomputed from the server's absolute timestamp via
 * `secondsRemaining`, so a tab suspended for a minute resumes at the
 * correct number rather than resuming a stale local count (T-1-24).
 *
 * Under `URGENT_THRESHOLD_SECONDS` the numerals turn stamp red — a static
 * colour change on a threshold, not a pulse or a flash, so this component
 * imports no motion library at all.
 */
export function RoundClock({ deadlineAt }: RoundClockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const seconds = secondsRemaining(deadlineAt, now);
  const urgent = isUrgent(seconds);

  return (
    <div
      className={`flex items-baseline gap-2 rounded-[3px] border-2 px-2.5 py-0.5 ${
        urgent ? 'border-stamp bg-stamp-wash text-stamp' : 'border-on-desk-muted/50 text-on-desk'
      }`}
      aria-live="off"
    >
      <span className={`label-caps text-[0.6rem] ${urgent ? 'text-stamp' : 'text-on-desk-muted'}`}>Clock</span>
      <p className="font-display text-2xl leading-none tabular-nums">{clockLabel(seconds)}</p>
    </div>
  );
}

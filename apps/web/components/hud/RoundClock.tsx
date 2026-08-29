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
 * Under `URGENT_THRESHOLD_SECONDS` the numerals take the `#2563EB` accent —
 * a static colour change on a threshold, not a pulse or a flash. D-10
 * permits no animation beyond D-06's step transitions, so this component
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
    <p
      className={`text-sm font-semibold tabular-nums ${urgent ? 'text-[#2563eb]' : 'text-[#0f172a]'}`}
    >
      {clockLabel(seconds)}
    </p>
  );
}

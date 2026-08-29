'use client';

import type { LobbySnapshot } from '@berlin/shared';
import { useEffect, useState } from 'react';
import { shouldShowCountdown } from '../../lib/seatRows.js';

export interface ReadyCountdownProps {
  snapshot: LobbySnapshot;
}

/**
 * Renders nothing unless the server has set startsAt (LOBBY-04's >=50%
 * threshold-gated countdown). The countdown's VALUE always derives from
 * the server's absolute timestamp; only the render cadence — the interval
 * tick used to re-read the clock — is local (apps/web/CLAUDE.md rule 6).
 * Numerals switch to the accent colour under 10 seconds as a static style
 * change, not an animation (01-UI-SPEC.md).
 */
export function ReadyCountdown({ snapshot }: ReadyCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!shouldShowCountdown(snapshot)) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [snapshot]);

  if (!shouldShowCountdown(snapshot) || snapshot.startsAt === null) return null;

  const remainingMs = Math.max(0, snapshot.startsAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const urgent = remainingSeconds < 10;

  return (
    <p
      className={urgent ? 'text-sm font-semibold text-[#2563eb]' : 'text-sm text-[#0f172a]'}
      aria-live="polite"
    >
      Match starts in {remainingSeconds}s
    </p>
  );
}

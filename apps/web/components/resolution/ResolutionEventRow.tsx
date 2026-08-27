import type { ResolutionEvent } from '@berlin/shared';
import { eventText } from '../../lib/format.js';

export interface ResolutionEventRowProps {
  event: ResolutionEvent;
}

/**
 * One row per `ResolutionEvent`, rendered through `format.eventText` — the
 * one formatter shared by the visual row and its accessible announcement
 * (apps/web/lib/CLAUDE.md rule 5), so the two can never drift apart.
 */
export function ResolutionEventRow({ event }: ResolutionEventRowProps) {
  return (
    <li className="rounded border border-[#e2e8f0] px-3 py-2 text-sm text-[#0f172a]">
      {eventText(event)}
    </li>
  );
}

import type { ResolutionEvent } from '@berlin/shared';
import { eventText } from '../../lib/format.js';

export interface ResolutionEventRowProps {
  event: ResolutionEvent;
}

/**
 * One row's content, rendered through `format.eventText` — the one
 * formatter shared by the visual row and its accessible announcement
 * (apps/web/lib/CLAUDE.md rule 5), so the two can never drift apart. Text
 * only, not the `<li>` wrapper: `StepThrough.tsx` owns the list-item
 * element so it can attach the per-row reveal transition (D-06) to it.
 */
export function ResolutionEventRow({ event }: ResolutionEventRowProps) {
  return <>{eventText(event)}</>;
}

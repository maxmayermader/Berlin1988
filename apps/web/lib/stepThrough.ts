import type { ResolutionEvent } from '@berlin/shared';

/**
 * The click-to-advance reveal pacing (MATCH-05, D-05) as a pure reducer —
 * this is the whole mechanism behind the plan's prohibition on concealment
 * by CSS (apps/web/components/board/CLAUDE.md rule 2). Revealing is
 * `log.slice(0, n)`; the unrevealed tail is never returned, so it never
 * reaches a component or the document. No sorting, filtering, or grouping —
 * the reducer has no code path that inspects an event's contents at all,
 * which is what makes "never reorders, merges, or runs ahead" true by
 * construction rather than by convention.
 */

/** The first event is revealed immediately — it is always ROUND_START,
 *  which announces nothing on its own. */
export const REVEALED_AT_START = 1;

export interface RevealState {
  readonly revealed: number;
}

/** Starts at REVEALED_AT_START, clamped to the log's own length so a
 *  one-event log (or, degenerately, an empty one) is immediately complete
 *  rather than requesting a slice past the end. */
export function initialReveal(log: readonly ResolutionEvent[]): RevealState {
  return { revealed: Math.min(REVEALED_AT_START, log.length) };
}

/** One more event per call. Past the end of the log, the state is returned
 *  unchanged — advancing never throws and never wraps. */
export function advance(state: RevealState, log: readonly ResolutionEvent[]): RevealState {
  if (state.revealed >= log.length) return state;
  return { revealed: state.revealed + 1 };
}

/** The visible slice — always `log.slice(0, n)`, the engine's own prefix,
 *  never a reordered or re-sorted one. */
export function revealedEvents(
  log: readonly ResolutionEvent[],
  state: RevealState,
): readonly ResolutionEvent[] {
  return log.slice(0, state.revealed);
}

export function isComplete(log: readonly ResolutionEvent[], state: RevealState): boolean {
  return state.revealed >= log.length;
}

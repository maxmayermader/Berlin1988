'use client';

import type { ResolutionEvent } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import { fadeSlideUpVariant } from '../../lib/motion.js';
import { initialReveal, isComplete, revealedEvents } from '../../lib/stepThrough.js';
import { useUiStore } from '../../lib/uiStore.js';
import { Button } from '../ui/Button.js';
import { ResolutionEventRow } from './ResolutionEventRow.js';

export interface StepThroughProps {
  /** Already fog-filtered — `view.lastRound`, in the engine's own order. */
  log: readonly ResolutionEvent[];
  /** The round that just resolved (from the log's own ROUND_START event). */
  round: number;
  /** True once `view.outcome` is non-null — the result screen (Plan 01-06)
   *  takes over instead of a "Continue" prompt. */
  isFinal: boolean;
  /**
   * 'step' (default) is the live resolution — click-to-advance through
   * `apps/web/lib/uiStore.ts`'s single global `reveal` cursor, ending in a
   * "Next"/"Continue" control. 'full' is a historical round re-read
   * (Plan 04-02's `RoundHistoryPanel`): the whole log renders at once and
   * neither control appears.
   *
   * The reason this prop exists rather than history reusing 'step' mode:
   * `reveal` is a *single global value*, shared by every mounted
   * `StepThrough`. If an expanded history row shared it, its "Next" button
   * would advance the live resolution the player is still watching, and its
   * "Continue" button would call `exitResolution()` on the live match. A
   * historical round is something the player already watched in full, so
   * 'full' mode reads no reveal state and offers no way to mutate live
   * match presentation — see T-04-07.
   */
  mode?: 'step' | 'full';
}

/**
 * Click-to-advance reveal of the round that just resolved (D-05, D-06).
 * `revealedEvents(log, reveal)` is the only source for what renders — a
 * slice of the array, never a toggled-visibility render of the whole log
 * (apps/web/components/board/CLAUDE.md rule 2; T-1-23). The unrevealed tail
 * is simply not in `visible`, so it is never in the document to begin with.
 */
export function StepThrough({ log, round, isFinal, mode = 'step' }: StepThroughProps) {
  // useUiStore hooks stay unconditional (Rules of Hooks) even in 'full'
  // mode, where their values are simply unused.
  const reveal = useUiStore((s) => s.reveal) ?? initialReveal(log);
  const advanceReveal = useUiStore((s) => s.advanceReveal);
  const exitResolution = useUiStore((s) => s.exitResolution);
  // The instant-cut-under-reduced-motion policy (apps/web/components/board/
  // CLAUDE.md rule 4) now lives in apps/web/lib/motion.ts (D-08) — this hook
  // call stays here because apps/web/lib/stepThrough.test.ts reads for it;
  // only the branch itself moved to fadeSlideUpVariant below.
  const reducedMotion = useReducedMotion();

  const visible = mode === 'full' ? log : revealedEvents(log, reveal);
  const complete = mode === 'full' ? true : isComplete(log, reveal);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold leading-[1.2]">Round {round} resolved</h2>
      <ol aria-live="polite" className="flex flex-col gap-2">
        {visible.map((event, index) => (
          <motion.li
            key={index}
            {...fadeSlideUpVariant(reducedMotion)}
            className="rounded border border-[#e2e8f0] px-3 py-2 text-sm text-[#0f172a]"
          >
            <ResolutionEventRow event={event} />
          </motion.li>
        ))}
      </ol>
      {mode !== 'full' && !complete && <Button onClick={() => advanceReveal(log)}>Next</Button>}
      {mode !== 'full' && complete && !isFinal && (
        <Button onClick={() => exitResolution()}>Continue to Round {round + 1}</Button>
      )}
    </div>
  );
}

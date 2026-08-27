'use client';

import type { ResolutionEvent } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
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
}

/**
 * Click-to-advance reveal of the round that just resolved (D-05, D-06).
 * `revealedEvents(log, reveal)` is the only source for what renders — a
 * slice of the array, never a toggled-visibility render of the whole log
 * (apps/web/components/board/CLAUDE.md rule 2; T-1-23). The unrevealed tail
 * is simply not in `visible`, so it is never in the document to begin with.
 */
export function StepThrough({ log, round, isFinal }: StepThroughProps) {
  const reveal = useUiStore((s) => s.reveal) ?? initialReveal(log);
  const advanceReveal = useUiStore((s) => s.advanceReveal);
  const exitResolution = useUiStore((s) => s.exitResolution);
  // apps/web/components/board/CLAUDE.md rule 4: reduced motion cuts between
  // beats rather than tweening — the row is never withheld, only its
  // transition changes. `initial={false}` skips the mount animation
  // entirely rather than running it at zero duration, so there is no
  // flash-then-settle under prefers-reduced-motion.
  const reducedMotion = useReducedMotion();

  const visible = revealedEvents(log, reveal);
  const complete = isComplete(log, reveal);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[20px] font-semibold leading-[1.2]">Round {round} resolved</h2>
      <ol aria-live="polite" className="flex flex-col gap-2">
        {visible.map((event, index) => (
          <motion.li
            key={index}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded border border-[#e2e8f0] px-3 py-2 text-sm text-[#0f172a]"
          >
            <ResolutionEventRow event={event} />
          </motion.li>
        ))}
      </ol>
      {!complete && <Button onClick={() => advanceReveal(log)}>Next</Button>}
      {complete && !isFinal && (
        <Button onClick={() => exitResolution()}>Continue to Round {round + 1}</Button>
      )}
    </div>
  );
}

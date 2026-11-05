'use client';

import { useEffect, useRef, useState } from 'react';
import type { ResolutionEvent } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import type { EventContext } from '../../lib/format.js';
import { fadeSlideUpVariant } from '../../lib/motion.js';
import { BEAT_MS, beatFor, type BeatTone } from '../../lib/replay.js';
import { initialReveal, isComplete, revealedEvents } from '../../lib/stepThrough.js';
import { useUiStore } from '../../lib/uiStore.js';
import { Button } from '../ui/Button.js';
import { ResolutionEventRow } from './ResolutionEventRow.js';

export interface StepThroughProps {
  /** Already fog-filtered — `view.lastRound`, in the engine's own order. */
  log: readonly ResolutionEvent[];
  /** The round that just resolved (from the log's own ROUND_START event). */
  round: number;
  /** True once `view.outcome` is non-null — the result screen takes over
   *  instead of a "Continue" prompt. */
  isFinal: boolean;
  /**
   * 'step' (default) is the live resolution — auto-playing beat by beat
   * through `apps/web/lib/uiStore.ts`'s single global `reveal` cursor, with
   * pause / next / skip, ending in a "Continue" control. 'full' is a
   * historical round re-read (RoundHistoryPanel): the whole log renders at
   * once and no control appears.
   *
   * The reason this prop exists rather than history reusing 'step' mode:
   * `reveal` is a *single global value*, shared by every mounted
   * `StepThrough`. If an expanded history row shared it, its controls would
   * advance the live resolution the player is still watching, and its
   * "Continue" would call `exitResolution()` on the live match — see T-04-07.
   */
  mode?: 'step' | 'full';
  /** Names and places for the prose (lib/format.ts `eventContextFor`). */
  ctx?: EventContext;
}

const TONE_RULE: Record<BeatTone, string> = {
  neutral: 'border-l-rule',
  move: 'border-l-accent',
  danger: 'border-l-stamp',
  intel: 'border-l-ok',
  success: 'border-l-ok',
  warning: 'border-l-warn',
};

/**
 * The round report (REPLAY-01/02). `revealedEvents(log, reveal)` is the
 * only source for what renders — a slice of the array, never a
 * toggled-visibility render of the whole log (apps/web/components/board/
 * CLAUDE.md rule 2; T-1-23). The unrevealed tail is simply not in
 * `visible`, so it is never in the document to begin with.
 *
 * Auto-play advances that same cursor on a timer; Pause, Next and Skip all
 * act on it too, so the board's beat (driven from the same cursor by the
 * match route) and this list can never disagree. Under reduced motion the
 * beats still advance — they cut instead of tween (rule 4).
 */
export function StepThrough({ log, round, isFinal, mode = 'step', ctx }: StepThroughProps) {
  // useUiStore hooks stay unconditional (Rules of Hooks) even in 'full'
  // mode, where their values are simply unused.
  const reveal = useUiStore((s) => s.reveal) ?? initialReveal(log);
  const advanceReveal = useUiStore((s) => s.advanceReveal);
  const revealAllEvents = useUiStore((s) => s.revealAllEvents);
  const exitResolution = useUiStore((s) => s.exitResolution);
  // The instant-cut-under-reduced-motion policy lives in apps/web/lib/motion.ts
  // (D-08); this hook call feeds it.
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(mode === 'step');
  const listRef = useRef<HTMLOListElement>(null);

  const visible = mode === 'full' ? log : revealedEvents(log, reveal);
  const complete = mode === 'full' ? true : isComplete(log, reveal);

  // Auto-play: one beat per BEAT_MS while playing and not yet complete.
  useEffect(() => {
    if (mode !== 'step' || !playing || complete) return;
    const id = setTimeout(() => advanceReveal(log), BEAT_MS);
    return () => clearTimeout(id);
  }, [mode, playing, complete, reveal.revealed, advanceReveal, log]);

  // Keep the newest beat in view as the list grows.
  useEffect(() => {
    if (mode !== 'step') return;
    const last = listRef.current?.lastElementChild;
    if (last && 'scrollIntoView' in last) {
      (last as HTMLElement).scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [mode, visible.length, reducedMotion]);

  const current = visible[visible.length - 1];
  const currentStep = current ? beatFor(current).step : null;

  return (
    <div className="flex flex-col gap-3">
      {mode !== 'full' && (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl leading-none">Round {round} resolved</h2>
          <p className="label-caps text-[0.62rem] text-ink-muted">
            Beat {visible.length} of {log.length}
            {currentStep ? ` · ${currentStep}` : ''}
          </p>
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-rule/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={log.length}
            aria-valuenow={visible.length}
            aria-label="Replay progress"
          >
            <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${(visible.length / Math.max(1, log.length)) * 100}%` }} />
          </div>
        </div>
      )}

      <ol
        ref={listRef}
        aria-live="polite"
        className={`flex flex-col gap-1 ${mode === 'step' ? 'max-h-[46dvh] overflow-y-auto pr-1' : ''}`}
      >
        {visible.map((event, index) => {
          const beat = beatFor(event);
          const isCurrent = mode === 'step' && index === visible.length - 1;
          return (
            <motion.li
              key={index}
              {...fadeSlideUpVariant(reducedMotion)}
              className={`rounded-[2px] border-l-4 px-2.5 py-1.5 text-sm ${TONE_RULE[beat.tone]} ${
                isCurrent ? 'paper font-bold shadow-[1px_1px_0_0_var(--color-rule)]' : 'bg-paper/45'
              }`}
            >
              <ResolutionEventRow event={event} ctx={ctx} />
            </motion.li>
          );
        })}
      </ol>

      {mode !== 'full' && !complete && (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
            {playing ? '❚❚ Pause' : '▶ Play'}
          </Button>
          <Button
            onClick={() => {
              setPlaying(false);
              advanceReveal(log);
            }}
          >
            Next
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPlaying(false);
              revealAllEvents(log);
            }}
          >
            Skip ⇥
          </Button>
        </div>
      )}
      {mode !== 'full' && complete && !isFinal && (
        <Button size="lg" block onClick={() => exitResolution()}>
          Continue to Round {round + 1}
        </Button>
      )}
    </div>
  );
}

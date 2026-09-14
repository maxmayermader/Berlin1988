'use client';

import { useState } from 'react';
import type { ResolutionEvent } from '@berlin/shared';
import { motion, useReducedMotion } from 'motion/react';
import { fadeSlideUpVariant } from '../../lib/motion.js';
import { roundHeadline, roundNumberOf } from '../../lib/format.js';
import { StepThrough } from './StepThrough.js';

export interface RoundHistoryPanelProps {
  /** view.history — the viewer's own full match history, flat and pre-filtered. */
  history: readonly (readonly ResolutionEvent[])[];
  selfId: string;
}

/**
 * MATCH-06 (D-03): a condensed one-row-per-round list, newest round first,
 * rendered from `PlayerView.history`. Each row's headline text comes from
 * `roundHeadline()` (apps/web/lib/format.ts) — this component never builds
 * that text itself. Expanding a row swaps in the existing `StepThrough`
 * renderer in `mode="full"`, so there is no second event-log renderer
 * (apps/web/lib/CLAUDE.md rule 5, T-04-09).
 */
export function RoundHistoryPanel({ history, selfId }: RoundHistoryPanelProps) {
  const reducedMotion = useReducedMotion();

  if (history.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="text-[20px] font-semibold leading-[1.2]">No rounds yet</h3>
        <p className="text-base text-[#64748b]">
          History fills in once your first round resolves.
        </p>
      </div>
    );
  }

  // Newest round first — reverse a copy, never mutate the prop.
  const rows = history.map((log, index) => ({ log, index })).reverse();

  return (
    <ol className="flex-1 overflow-y-auto flex flex-col gap-2">
      {rows.map(({ log, index }) => (
        <HistoryRow
          key={index}
          log={log}
          // roundNumberOf reads the real round from the log's own
          // ROUND_START event; index + 1 is only the defensive fallback for
          // a malformed entry, matching format.ts's own doc comment.
          fallbackRound={index + 1}
          selfId={selfId}
          reducedMotion={reducedMotion}
        />
      ))}
    </ol>
  );
}

interface HistoryRowProps {
  log: readonly ResolutionEvent[];
  fallbackRound: number;
  selfId: string;
  /** Passed down from the panel's single reduced-motion preference read
   *  rather than re-reading it again per row. */
  reducedMotion: boolean | null;
}

/**
 * One history row: a condensed headline that expands in place into a full
 * `StepThrough` replay. Each row owns its own `expanded` state, so rows
 * expand independently and no shared store is involved — deliberately
 * distinct from the live resolution's single global `reveal` cursor
 * (`apps/web/lib/uiStore.ts`), which `StepThrough`'s `mode="full"` never
 * touches (T-04-07).
 */
function HistoryRow({ log, fallbackRound, selfId, reducedMotion }: HistoryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const round = roundNumberOf(log, fallbackRound);
  const headline = roundHeadline(log);

  // T-04-08: this check reads only fields the viewer already holds — the
  // event's own playerId (kept through fog reduction for AGENT_BURNED) and
  // the viewer's own selfId. No opponent field, no re-derivation of what
  // the engine already decided to show.
  const burnedSelf = log.some(
    (event) => event.type === 'AGENT_BURNED' && (event.playerId as string) === selfId,
  );

  return (
    <motion.li
      {...fadeSlideUpVariant(reducedMotion)}
      className={`rounded border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-sm text-[#0f172a] ${
        burnedSelf ? 'border-l-4 border-l-[#dc2626]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p>
          <span className="text-sm">Round {round}</span>
          {' — '}
          <span className={`text-base ${headline === 'quiet round' ? 'text-[#64748b]' : ''}`}>
            {headline}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? `Collapse round ${round}` : `Expand round ${round}`}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-sm"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded && (
        <motion.div {...fadeSlideUpVariant(reducedMotion)} className="mt-2">
          {/* isFinal is always false for a historical round — only the live
           *  in-progress resolution can be final, and the match route
           *  already returns the result screen before that case arises. */}
          <StepThrough log={log} round={round} isFinal={false} mode="full" />
        </motion.div>
      )}
    </motion.li>
  );
}

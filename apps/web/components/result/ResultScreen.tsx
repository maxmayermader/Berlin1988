import type { PlayerView } from '@berlin/shared';
import { outcomeExplanation, outcomeHeadline, scoreboard } from '../../lib/result.js';
import { Stamp } from '../ui/Stamp.js';

export interface ResultScreenProps {
  /** `view.outcome` must be non-null before this renders — the match route
   *  (apps/web/app/match/[code]/page.tsx) is the only caller and only
   *  mounts this in place of the composer/step-through once it is. */
  view: PlayerView;
}

const REASON_STAMP = {
  EXTRACTION: 'Extracted',
  ELIMINATION: 'Network burned',
  ROUND_LIMIT: 'Time expired',
} as const;

/**
 * The terminal match screen (MATCH-08) — the case file closed: winner,
 * reason, scoreboard, and nothing computed. Every value comes from
 * `apps/web/lib/result.ts`, which reads only `view.outcome`, `view.self`,
 * and `view.opponents`.
 */
export function ResultScreen({ view }: ResultScreenProps) {
  const outcome = view.outcome;
  if (!outcome) return null;

  const headline = outcomeHeadline(view);
  const explanation = outcomeExplanation(view);
  const rows = scoreboard(view);
  // ELIMINATION and only ELIMINATION styles the headline with the
  // destructive stamp red — a style change, not a ranking or a re-derived
  // verdict.
  const isElimination = outcome.reason === 'ELIMINATION';
  const selfWon = rows.some((row) => row.isSelf && row.isWinner);

  return (
    <div
      className="manila relative overflow-hidden rounded-[4px] px-6 pb-8 pt-10 text-center shadow-sheet sm:px-10"
      data-outcome-reason={outcome.reason}
    >
      <p className="label-caps text-ink-muted">Case closed · {REASON_STAMP[outcome.reason]}</p>
      <h1 className={`mt-3 font-display text-4xl leading-tight sm:text-5xl ${isElimination ? 'text-stamp' : ''}`}>
        {headline}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed">{explanation}</p>

      <div className="mt-5 flex justify-center">
        <Stamp tone={selfWon ? 'ok' : 'stamp'} tilt={-6} animate className="text-2xl sm:text-3xl">
          {selfWon ? 'Mission accomplished' : 'Compromised'}
        </Stamp>
      </div>

      <ol
        className="paper mx-auto mt-7 flex w-full max-w-md flex-col rounded-[2px] border border-rule p-2 text-left shadow-[1px_2px_0_0_var(--color-rule)]"
        aria-label="Final scores"
      >
        {rows.map((row, index) => (
          <li
            key={`${index}-${row.name}`}
            className={`flex items-center justify-between gap-3 border-b border-dashed border-rule px-3 py-2 last:border-b-0 ${
              row.isWinner ? 'font-bold' : ''
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="w-5 text-right text-sm tabular-nums text-ink-muted">{index + 1}.</span>
              <span>
                {row.name}
                {row.isSelf ? ' (you)' : ''}
                {row.isWinner ? ' — winner' : ''}
              </span>
            </span>
            <span className="tabular-nums">{row.score}</span>
          </li>
        ))}
      </ol>

      <a
        href="/"
        className="label-caps mt-7 inline-flex min-h-11 items-center rounded-[3px] border-2 border-ink/50 px-4 hover:bg-ink/10"
      >
        Open a new file
      </a>
    </div>
  );
}

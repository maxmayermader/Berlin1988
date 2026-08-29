import type { PlayerView } from '@berlin/shared';
import { outcomeExplanation, outcomeHeadline, scoreboard } from '../../lib/result.js';

export interface ResultScreenProps {
  /** `view.outcome` must be non-null before this renders — the match route
   *  (apps/web/app/match/[code]/page.tsx) is the only caller and only
   *  mounts this in place of the composer/step-through once it is. */
  view: PlayerView;
}

/**
 * The terminal match screen (MATCH-08, 01-UI-SPEC.md's Copywriting
 * Contract) — winner, reason, scoreboard, and nothing computed. Every
 * value comes from `apps/web/lib/result.ts`, which reads only
 * `view.outcome`, `view.self`, and `view.opponents`. No rematch action
 * this phase (01-UI-SPEC.md Screens table).
 */
export function ResultScreen({ view }: ResultScreenProps) {
  const outcome = view.outcome;
  if (!outcome) return null;

  const headline = outcomeHeadline(view);
  const explanation = outcomeExplanation(view);
  const rows = scoreboard(view);
  // ELIMINATION and only ELIMINATION styles with the destructive colour
  // (01-UI-SPEC.md Color: #DC2626 reserved list) — a style change, not a
  // ranking or a re-derived verdict.
  const isElimination = outcome.reason === 'ELIMINATION';

  return (
    <div className="flex flex-col gap-6 px-6 py-16 text-center" data-outcome-reason={outcome.reason}>
      <h1
        className="text-[28px] font-semibold leading-[1.2]"
        style={isElimination ? { color: '#dc2626' } : undefined}
      >
        {headline}
      </h1>
      <p className="text-base leading-[1.5]">{explanation}</p>
      <ol className="mx-auto flex w-full max-w-sm flex-col gap-2 text-left" aria-label="Final scores">
        {rows.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between rounded border border-[#e2e8f0] px-3 py-2 text-sm"
          >
            <span>
              {row.name}
              {row.isSelf ? ' (you)' : ''}
              {row.isWinner ? ' — winner' : ''}
            </span>
            <span className="font-medium">{row.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

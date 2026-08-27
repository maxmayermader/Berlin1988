import type { PlayerId, PlayerView } from '@berlin/shared';
import { truncateCodename } from './format.js';

/**
 * The result screen's copy mapping — pure, and the single place the three
 * MATCH-08 sentences live. Every function here reads only `view.outcome`,
 * `view.self`, and `view.opponents`: no score comparison, no ranking, no
 * tie-break. `MatchOutcome.winners` is a list because a round-14 tie
 * *is* representable that way, and the engine's own `checkVictory()`
 * (packages/engine/src/victory.ts) already decided who is in it — this
 * module's job is to name every one of them, never to choose among them
 * (01-RESEARCH.md's Don't Hand-Roll table; this plan's planner_assumptions).
 */

/** Looks an id up against the viewer's own record first, then opponents —
 *  the only two places a PlayerView can name a player at all. */
function nameOf(view: PlayerView, id: PlayerId): string {
  if (id === view.self.id) return truncateCodename(view.self.name);
  const opp = view.opponents.find((o) => o.id === id);
  return opp ? truncateCodename(opp.name) : 'Unknown';
}

/** Every winner's codename, truncated, in the exact order the engine's own
 *  `MatchOutcome.winners` lists them — no sort, no rank, no "first wins". */
export function winnerNames(view: PlayerView): string[] {
  if (!view.outcome) return [];
  return view.outcome.winners.map((id) => nameOf(view, id));
}

/** "{Codename} wins" for one winner; every tied winner joined for more than
 *  one, since a round-limit tie is the engine's answer, not a choice this
 *  screen makes. */
export function outcomeHeadline(view: PlayerView): string {
  const names = winnerNames(view);
  if (names.length === 0) return 'No winner.';
  if (names.length === 1) return `${names[0]} wins`;
  return `${names.join(' and ')} win`;
}

/**
 * The Copywriting Contract's three sentences, verbatim
 * (01-UI-SPEC.md). A switch with no default over `OutcomeReason` — the same
 * exhaustiveness pattern as apps/web/lib/format.ts's `eventText` — makes a
 * fourth outcome reason a compile error rather than a blank explanation.
 */
export function outcomeExplanation(view: PlayerView): string {
  const outcome = view.outcome;
  if (!outcome) return '';

  switch (outcome.reason) {
    case 'EXTRACTION':
      return '3 dossiers extracted.';
    case 'ELIMINATION':
      return 'All opposing agents eliminated.';
    case 'ROUND_LIMIT': {
      const names = winnerNames(view);
      const who = names.length > 0 ? names.join(' and ') : 'the leader';
      return `Round ${view.settings.roundLimit} reached — ${who} led on score.`;
    }
  }
}

export interface ScoreboardRow {
  readonly name: string;
  readonly score: number;
  readonly isSelf: boolean;
  readonly isWinner: boolean;
}

/** One row per player, self first then opponents in the view's own order —
 *  never sorted by score. Every score is copied verbatim from the view: no
 *  rounding, no padding, no unit suffix. */
export function scoreboard(view: PlayerView): ScoreboardRow[] {
  const winners: readonly PlayerId[] = view.outcome?.winners ?? [];

  const rows: ScoreboardRow[] = [
    {
      name: truncateCodename(view.self.name),
      score: view.self.score,
      isSelf: true,
      isWinner: winners.includes(view.self.id),
    },
  ];
  for (const opp of view.opponents) {
    rows.push({
      name: truncateCodename(opp.name),
      score: opp.score,
      isSelf: false,
      isWinner: winners.includes(opp.id),
    });
  }
  return rows;
}

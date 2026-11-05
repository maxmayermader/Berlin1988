'use client';

import type { PlayerView } from '@berlin/shared';
import { SECTOR_TERRITORY } from '../../lib/sectors.js';
import { SectorGlyph } from '../intel/SectorGlyph.js';
import { LockedInRow } from './LockedInRow.js';
import { RoundClock } from './RoundClock.js';
import { SubmittedCount } from './SubmittedCount.js';

export interface MatchHeaderProps {
  view: PlayerView;
  /** The round the screen is currently about (the replay shows the round
   *  that just resolved, not the next one). */
  displayRound: number;
  clockDeadline: number | null;
  /** True while the round report replays. The next round's clock is
   *  already running on the server, so it stays on screen — labelled as
   *  the next round's — rather than surprising the player on Continue. */
  replaying: boolean;
}

/**
 * The file's masthead: who you are, which round of how many, when the city
 * starts sealing, the server clock, and who has committed.
 */
export function MatchHeader({ view, displayRound, clockDeadline, replaying }: MatchHeaderProps) {
  const limit = view.settings.roundLimit;
  const blockadesFrom = view.settings.blockadeMode === 'OFF' ? null : view.ruleset.blockadeStartRound;

  return (
    <header className="desk-surface border-b border-black/40 shadow-[0_6px_18px_-10px_rgb(0_0_0/0.8)]">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-2xl leading-none tracking-[0.08em] text-on-desk">BERLIN&nbsp;1988</span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="label-caps text-[0.6rem] text-on-desk-muted">Operation file · {view.map.name}</span>
            <span className="flex items-center gap-1.5 text-sm text-on-desk">
              <SectorGlyph sector={view.self.faction} size={12} />
              {view.self.name} · {SECTOR_TERRITORY[view.self.faction]}
            </span>
          </span>
        </div>

        <RoundTrack round={displayRound} limit={limit} blockadesFrom={blockadesFrom} />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <LockedInRow view={view} />
          <SubmittedCount view={view} />
          {replaying && <span className="label-caps text-[0.6rem] text-on-desk-muted">Round {view.round} clock →</span>}
          <RoundClock deadlineAt={clockDeadline} />
        </div>
      </div>
    </header>
  );
}

/**
 * Round N of the limit as a row of ticks; rounds the blockade sweep can hit
 * carry a red notch, so "the city closes from round 7" is visible at a glance.
 */
function RoundTrack({ round, limit, blockadesFrom }: { round: number; limit: number; blockadesFrom: number | null }) {
  return (
    <div className="flex flex-col gap-1" aria-label={`Round ${round} of ${limit}`} role="img">
      <span className="label-caps text-[0.62rem] text-on-desk-muted">
        Round <b className="text-on-desk">{round}</b> / {limit}
        {blockadesFrom !== null && round < blockadesFrom && <span> · sealing from R{blockadesFrom}</span>}
        {blockadesFrom !== null && round >= blockadesFrom && <span className="text-alarm"> · city sealing</span>}
      </span>
      <span className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: limit }, (_, i) => {
          const n = i + 1;
          const done = n < round;
          const current = n === round;
          const sealing = blockadesFrom !== null && n >= blockadesFrom;
          return (
            <span
              key={n}
              className={`relative h-2.5 w-2.5 rounded-[1px] border ${
                current
                  ? 'border-on-desk bg-on-desk'
                  : done
                    ? 'border-on-desk-muted/70 bg-on-desk-muted/60'
                    : 'border-on-desk-muted/50'
              }`}
            >
              {sealing && <span className="absolute -bottom-[5px] left-0 h-[2px] w-full bg-alarm" />}
            </span>
          );
        })}
      </span>
    </div>
  );
}

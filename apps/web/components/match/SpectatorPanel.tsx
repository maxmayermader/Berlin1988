import { Stamp } from '../ui/Stamp.js';

export interface SpectatorPanelProps {
  /** How many players are still in the game. */
  playersLeft: number;
}

/**
 * SPECT-01/02: an eliminated player keeps watching instead of staring at an
 * empty order panel. Nothing new is shown to them — they keep the public
 * reports, the roster, every Burn Track and the round replays their own fog
 * already delivers (SPECT-03: no omniscient ghost view, docs/GAME_DESIGN.md
 * §8.1). With no agents left, their fog has no eyes on the map.
 */
export function SpectatorPanel({ playersLeft }: SpectatorPanelProps) {
  return (
    <div className="flex flex-col gap-3" data-spectating="true">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl leading-none">Eliminated — watching</h2>
        <Stamp tilt={-6} animate className="text-sm">
          Burned
        </Stamp>
      </div>
      <p className="text-sm">
        Your network is gone, but the file stays open. You keep receiving public reports, the personnel roster, every
        Burn Track and each round&apos;s replay until the match ends.
      </p>
      <p className="text-sm text-ink-muted">
        With no agents in the field you have no eyes on the map — the city goes dark. {playersLeft} player
        {playersLeft === 1 ? '' : 's'} still in play.
      </p>
    </div>
  );
}

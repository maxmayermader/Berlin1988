'use client';

import type { PlayerView } from '@berlin/shared';
import { useState } from 'react';
import { truncateCodename } from '../../lib/format.js';
import { useMatchStore } from '../../lib/matchStore.js';
import { type RosterRow, rosterRows } from '../../lib/roster.js';
import { SECTOR_TERRITORY } from '../../lib/sectors.js';
import { Folder } from '../ui/Folder.js';
import { Stamp } from '../ui/Stamp.js';
import { BurnTrackPanel } from './BurnTrackPanel.js';
import { SectorGlyph } from './SectorGlyph.js';

export interface RosterPanelProps {
  view: PlayerView;
}

/**
 * BURN-01/03/05: the personnel file. One card per player — faction, agents
 * standing versus burned, Intel and score, whether they are locked in for
 * this round — and each player's public Burn Track a click away.
 *
 * Opponent agents are shown as counts only (lib/roster.ts): which of a
 * rival's agents fell is not in the viewer's data, so it is not on screen.
 */
export function RosterPanel({ view }: RosterPanelProps) {
  const committed = useMatchStore((s) => s.committed);
  const rows = rosterRows(view, committed);
  const [openTrack, setOpenTrack] = useState<string | null>(null);

  return (
    <Folder tab="Personnel" aside={`${rows.filter((r) => !r.eliminated).length} in play`} bodyClassName="p-2">
      <ul className="flex flex-col gap-2" aria-label="Players">
        {rows.map((row) => (
          <RosterCard
            key={row.id}
            row={row}
            trackOpen={openTrack === row.id}
            onToggleTrack={() => setOpenTrack((current) => (current === row.id ? null : row.id))}
          />
        ))}
      </ul>
    </Folder>
  );
}

function AgentPips({ row }: { row: RosterRow }) {
  const pips =
    row.ownAgents ??
    Array.from({ length: row.agentsTotal }, (_, i) => ({ label: '', alive: i < row.agentsAlive }));
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`${row.agentsAlive} of ${row.agentsTotal} agent${row.agentsTotal === 1 ? '' : 's'} active, ${row.agentsTotal - row.agentsAlive} burned`}
      role="img"
    >
      {pips.map((pip, i) => (
        <span
          key={i}
          className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
            pip.alive ? 'border-ink bg-ink text-paper' : 'border-stamp/70 bg-transparent text-stamp'
          }`}
        >
          {pip.alive ? pip.label : '✕'}
        </span>
      ))}
    </span>
  );
}

function RosterCard({
  row,
  trackOpen,
  onToggleTrack,
}: {
  row: RosterRow;
  trackOpen: boolean;
  onToggleTrack: () => void;
}) {
  const trackId = `burn-track-${row.id}`;
  return (
    <li
      className={`paper relative overflow-hidden rounded-[3px] border px-3 py-2 ${
        row.isSelf ? 'border-accent/60 shadow-[inset_4px_0_0_0_var(--color-accent)]' : 'border-rule'
      } ${row.eliminated ? 'opacity-80' : ''}`}
      data-roster-player={row.isSelf ? 'self' : 'opponent'}
    >
      <div className="flex items-center gap-2">
        <SectorGlyph sector={row.faction} size={16} labelled />
        <span className="min-w-0 flex-1 truncate font-bold" title={row.name}>
          {truncateCodename(row.name)}
          {row.isSelf && <span className="font-normal text-ink-muted"> (you)</span>}
        </span>
        {row.isBot && (
          <span className="label-caps rounded-[2px] border border-ink-muted px-1 text-[0.6rem] text-ink-muted">AI</span>
        )}
        {row.lockedIn && !row.eliminated && (
          <span className="label-caps text-[0.62rem] text-ok" title="Orders locked in for this round">
            ✓ set
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
        <AgentPips row={row} />
        <span className="flex items-center gap-3 tabular-nums">
          <span title="Intel">
            <span className="label-caps text-[0.6rem] text-ink-muted">Intel </span>
            <b>{row.intel}</b>
          </span>
          <span title="Score">
            <span className="label-caps text-[0.6rem] text-ink-muted">Score </span>
            <b>{row.score}</b>
          </span>
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="label-caps text-[0.6rem] text-ink-muted">{SECTOR_TERRITORY[row.faction]}</span>
        <button
          type="button"
          onClick={onToggleTrack}
          aria-expanded={trackOpen}
          aria-controls={trackId}
          className="label-caps min-h-8 rounded-[2px] px-1.5 text-[0.62rem] text-accent underline decoration-dotted underline-offset-2 hover:bg-accent/10"
        >
          Burn Track ({row.burnTrack.length}) {trackOpen ? '▴' : '▾'}
        </button>
      </div>

      {trackOpen && (
        <div id={trackId} className="mt-2 border-t border-dashed border-rule pt-2">
          <BurnTrackPanel entries={row.burnTrack} ownerName={row.name} isSelf={row.isSelf} compact />
        </div>
      )}

      {row.eliminated && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Stamp tilt={-8} className="bg-paper/70 text-lg">
            Eliminated
          </Stamp>
        </div>
      )}
    </li>
  );
}

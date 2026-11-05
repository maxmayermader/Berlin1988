import { SECTORS } from '@berlin/shared';
import { SECTOR_PATTERN, SECTOR_TERRITORY } from '../../lib/sectors.js';
import { SectorGlyph } from '../intel/SectorGlyph.js';

const PATTERN_NAME = {
  diagonal: 'diagonal hatch',
  horizontal: 'ruled lines',
  dots: 'dotted',
  crosshatch: 'crosshatch',
} as const;

/**
 * The key to the city plan — every symbol the board draws, in words. The
 * board is never the only place a meaning lives (apps/web/CLAUDE.md rule 4).
 */
export function MapLegend() {
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <section className="flex flex-col gap-1.5">
        <h4 className="label-caps text-ink-muted">Sectors</h4>
        <ul className="flex flex-col gap-1">
          {SECTORS.map((sector) => (
            <li key={sector} className="flex items-center gap-2">
              <SectorGlyph sector={sector} size={14} filled={false} />
              <b>{SECTOR_TERRITORY[sector]}</b>
              <span className="text-ink-muted">
                {sector} · {PATTERN_NAME[SECTOR_PATTERN[sector]]}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-muted">The concrete band is the Wall — the border of East Berlin.</p>
      </section>

      <section className="flex flex-col gap-1.5">
        <h4 className="label-caps text-ink-muted">Routes</h4>
        <ul className="flex flex-col gap-1">
          <li className="flex items-center gap-2">
            <svg width="34" height="10" aria-hidden="true">
              <line x1="2" y1="5" x2="32" y2="5" style={{ stroke: 'var(--color-ink-muted)' }} strokeWidth="5" strokeLinecap="round" strokeOpacity="0.6" />
              <line x1="2" y1="5" x2="32" y2="5" style={{ stroke: 'var(--color-paper)' }} strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            <span>
              <b>Street</b> — free
            </span>
          </li>
          <li className="flex items-center gap-2">
            <svg width="34" height="10" aria-hidden="true">
              <line x1="2" y1="5" x2="32" y2="5" style={{ stroke: 'var(--color-sector-green)' }} strokeWidth="2" strokeDasharray="5 3" />
            </svg>
            <span>
              <b>U-Bahn tunnel</b> — 1 Intel, no chatter
            </span>
          </li>
          <li className="flex items-center gap-2">
            <svg width="34" height="12" aria-hidden="true">
              <line x1="2" y1="3.5" x2="32" y2="3.5" style={{ stroke: 'var(--color-ink)' }} strokeWidth="1.2" />
              <line x1="2" y1="8.5" x2="32" y2="8.5" style={{ stroke: 'var(--color-ink)' }} strokeWidth="1.2" />
              <rect x="14" y="1" width="6" height="10" style={{ fill: 'var(--color-stamp)' }} />
            </svg>
            <span>
              <b>Checkpoint</b> — 1 Intel, always reported
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-1.5 sm:col-span-2">
        <h4 className="label-caps text-ink-muted">Markers</h4>
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <li>
            <b>U</b> — U-Bahn station
          </li>
          <li>
            <b>ⓘ</b> — informant (blue: yours · black: taken)
          </li>
          <li>
            <b>Folder + number</b> — dossiers on the node
          </li>
          <li>
            <b>Dashed ring</b> — extraction point
          </li>
          <li>
            <b>Red ✕ · SEALED</b> — blockaded node
          </li>
          <li>
            <b>Numbered pin</b> — your agent
          </li>
          <li>
            <b>Blue house</b> — your safehouse (only you see it)
          </li>
          <li>
            <b>Red snare</b> — your ambush (only you see it)
          </li>
          <li>
            <b>Pencil line</b> — your draft orders; <b>inked</b> once locked in
          </li>
          <li>
            <b>Faded node</b> — out of your agents&apos; sight
          </li>
        </ul>
      </section>
    </div>
  );
}

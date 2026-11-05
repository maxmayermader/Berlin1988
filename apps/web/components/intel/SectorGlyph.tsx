import type { Sector } from '@berlin/shared';
import { SECTOR_COLOR, SECTOR_TERRITORY, sectorShapeGeometry } from '../../lib/sectors.js';

export interface SectorGlyphProps {
  sector: Sector;
  /** Pixel size. */
  size?: number;
  /** Solid fill (a faction badge) vs outline (a node). */
  filled?: boolean;
  /** Announce the sector to assistive tech. Off when a visible label
   *  already names it. */
  labelled?: boolean;
  className?: string;
}

/**
 * The sector silhouette as a tiny inline SVG — the same circle / square /
 * diamond / triangle the board draws, so colour is never the only cue
 * anywhere a sector appears.
 */
export function SectorGlyph({ sector, size = 14, filled = true, labelled = false, className = '' }: SectorGlyphProps) {
  const g = sectorShapeGeometry(sector, 10, 10, 15);
  const style = filled
    ? { fill: SECTOR_COLOR[sector], stroke: SECTOR_COLOR[sector] }
    : { fill: 'var(--color-paper)', stroke: SECTOR_COLOR[sector] };
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className}`}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? `${SECTOR_TERRITORY[sector]} (${sector})` : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {g.kind === 'circle' ? (
        <circle cx={g.cx} cy={g.cy} r={g.r} style={style} strokeWidth={2.2} />
      ) : (
        <polygon points={g.points} style={style} strokeWidth={2.2} strokeLinejoin="round" />
      )}
    </svg>
  );
}

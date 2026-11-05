import type { Sector } from '@berlin/shared';

/**
 * The one sector vocabulary for the whole client. A sector is always
 * rendered with at least two of these at once — colour plus shape, or
 * colour plus label — never colour alone (apps/web/components/CLAUDE.md).
 *
 * Pure data, no React, so the node-environment vitest run can import it.
 */

/** Ink colour, as a CSS variable reference into the theme (globals.css). */
export const SECTOR_COLOR: Record<Sector, string> = {
  RED: 'var(--color-sector-red)',
  BLUE: 'var(--color-sector-blue)',
  GOLD: 'var(--color-sector-gold)',
  GREEN: 'var(--color-sector-green)',
};

/** Node silhouette. The board, the roster, the burn track and the
 *  deckbuilder all draw the same shape for the same sector. */
export type SectorShape = 'circle' | 'square' | 'diamond' | 'triangle';

export const SECTOR_SHAPE: Record<Sector, SectorShape> = {
  RED: 'circle',
  BLUE: 'square',
  GOLD: 'diamond',
  GREEN: 'triangle',
};

/** Territory hatch, so a printed-in-greyscale board still reads. */
export type SectorPattern = 'diagonal' | 'horizontal' | 'dots' | 'crosshatch';

export const SECTOR_PATTERN: Record<Sector, SectorPattern> = {
  RED: 'diagonal',
  BLUE: 'horizontal',
  GOLD: 'dots',
  GREEN: 'crosshatch',
};

/** docs/GAME_DESIGN.md §3.1's territory names. */
export const SECTOR_TERRITORY: Record<Sector, string> = {
  RED: 'East Berlin',
  BLUE: 'West Berlin',
  GOLD: 'The Corridor',
  GREEN: 'U-Bahn',
};

/** Short uppercase tag for tight spaces. */
export const SECTOR_TAG: Record<Sector, string> = {
  RED: 'RED',
  BLUE: 'BLUE',
  GOLD: 'GOLD',
  GREEN: 'GRN',
};

/**
 * The polygon/circle geometry for a sector silhouette centred on (cx, cy)
 * with overall size `size`. Returned as plain data so the SVG board and the
 * small inline glyphs draw byte-identical shapes.
 */
export type ShapeGeometry =
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: 'polygon'; readonly points: string };

export function sectorShapeGeometry(sector: Sector, cx: number, cy: number, size: number): ShapeGeometry {
  const h = size / 2;
  switch (SECTOR_SHAPE[sector]) {
    case 'circle':
      return { kind: 'circle', cx, cy, r: h * 0.92 };
    case 'square':
      return { kind: 'polygon', points: pts([[cx - h * 0.85, cy - h * 0.85], [cx + h * 0.85, cy - h * 0.85], [cx + h * 0.85, cy + h * 0.85], [cx - h * 0.85, cy + h * 0.85]]) };
    case 'diamond':
      return { kind: 'polygon', points: pts([[cx, cy - h * 1.12], [cx + h * 1.12, cy], [cx, cy + h * 1.12], [cx - h * 1.12, cy]]) };
    case 'triangle':
      return { kind: 'polygon', points: pts([[cx, cy - h * 1.1], [cx + h * 1.05, cy + h * 0.8], [cx - h * 1.05, cy + h * 0.8]]) };
  }
}

function pts(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

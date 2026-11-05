import { SECTORS, type Sector } from '@berlin/shared';
import { SECTOR_COLOR, SECTOR_PATTERN } from '../../lib/sectors.js';

/** Stable id of a sector's hatch pattern, for `fill="url(#…)"`. */
export function hatchId(sector: Sector): string {
  return `hatch-${sector.toLowerCase()}`;
}

/** Arrowhead marker ids, one per ink. */
export const ARROW_IDS = {
  agent1: 'arrow-agent-1',
  agent2: 'arrow-agent-2',
  stamp: 'arrow-stamp',
  accent: 'arrow-accent',
  ok: 'arrow-ok',
  warn: 'arrow-warn',
} as const;

const ARROW_COLORS: Record<keyof typeof ARROW_IDS, string> = {
  agent1: 'var(--color-agent-1)',
  agent2: 'var(--color-agent-2)',
  stamp: 'var(--color-stamp)',
  accent: 'var(--color-accent)',
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
};

/**
 * Shared SVG <defs>: one hatch per sector (the non-colour territory
 * encoding — diagonal / horizontal / dots / crosshatch), the sheet grid, and
 * arrowheads. Rendered once per board.
 */
export function BoardDefs() {
  return (
    <defs>
      <pattern id="sheet-grid" width="5" height="5" patternUnits="userSpaceOnUse">
        <path d="M 5 0 L 0 0 0 5" fill="none" style={{ stroke: 'var(--color-rule)' }} strokeWidth={0.12} />
      </pattern>

      {SECTORS.map((sector) => (
        <SectorHatch key={sector} sector={sector} />
      ))}

      {(Object.keys(ARROW_IDS) as (keyof typeof ARROW_IDS)[]).map((key) => (
        <marker
          key={key}
          id={ARROW_IDS[key]}
          viewBox="0 0 10 10"
          refX="8.5"
          refY="5"
          markerWidth="4.2"
          markerHeight="4.2"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: ARROW_COLORS[key] }} />
        </marker>
      ))}
    </defs>
  );
}

function SectorHatch({ sector }: { sector: Sector }) {
  const color = SECTOR_COLOR[sector];
  const common = { style: { stroke: color }, strokeWidth: 0.22 };
  switch (SECTOR_PATTERN[sector]) {
    case 'diagonal':
      return (
        <pattern id={hatchId(sector)} width="1.8" height="1.8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="1.8" {...common} />
        </pattern>
      );
    case 'horizontal':
      return (
        <pattern id={hatchId(sector)} width="2" height="1.6" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0.8" x2="2" y2="0.8" {...common} />
        </pattern>
      );
    case 'dots':
      return (
        <pattern id={hatchId(sector)} width="1.9" height="1.9" patternUnits="userSpaceOnUse">
          <circle cx="0.95" cy="0.95" r="0.3" style={{ fill: color }} />
        </pattern>
      );
    case 'crosshatch':
      return (
        <pattern id={hatchId(sector)} width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <line x1="0" y1="0" x2="0" y2="2.2" {...common} />
          <line x1="0" y1="1.1" x2="2.2" y2="1.1" {...common} />
        </pattern>
      );
  }
}

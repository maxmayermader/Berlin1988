import type { MapDefinition, Sector } from '@berlin/shared';
import { useMemo } from 'react';
import { polygonPoints, sectorBorders, territoryCells, type ViewBox } from '../../lib/board.js';
import { SECTOR_COLOR } from '../../lib/sectors.js';
import { hatchId } from './BoardDefs.js';

export interface TerritoryProps {
  map: MapDefinition;
  box: ViewBox;
  /** A sector the player asked to see (from a sector-only signal). */
  highlightSector: Sector | null;
}

/**
 * District shading and the Wall. Cells are the Voronoi regions of the
 * node positions — public map geometry only, so nothing here can depend on
 * fog. Each cell is tinted in its sector's ink AND hatched in its sector's
 * pattern, so territory still reads in greyscale.
 */
export function Territory({ map, box, highlightSector }: TerritoryProps) {
  const cells = useMemo(() => territoryCells(map, box), [map, box]);
  const borders = useMemo(() => sectorBorders(map, cells), [map, cells]);
  const sectorOf = useMemo(() => new Map(map.nodes.map((n) => [n.id as string, n.sector])), [map]);

  return (
    <g aria-hidden="true">
      {cells.map((cell) => {
        const sector = sectorOf.get(cell.nodeId as string);
        if (!sector || cell.points.length < 3) return null;
        const points = polygonPoints(cell.points);
        const lit = highlightSector === sector;
        return (
          <g key={cell.nodeId as string}>
            <polygon points={points} style={{ fill: SECTOR_COLOR[sector] }} fillOpacity={lit ? 0.2 : 0.075} />
            <polygon points={points} fill={`url(#${hatchId(sector)})`} opacity={lit ? 0.75 : 0.3} />
          </g>
        );
      })}

      {borders.district.map((s, i) => (
        <line
          key={`d${i}`}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          style={{ stroke: 'var(--color-rule-strong)' }}
          strokeWidth={0.22}
          strokeDasharray="0.9 0.7"
        />
      ))}

      {/* The Wall: concrete slabs — a solid band broken into segments. */}
      {borders.wall.map((s, i) => (
        <g key={`w${i}`}>
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} style={{ stroke: 'var(--color-concrete)' }} strokeWidth={1.05} strokeLinecap="square" />
          <line
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            style={{ stroke: 'var(--color-paper)' }}
            strokeWidth={1.1}
            strokeDasharray="0.18 1.5"
          />
        </g>
      ))}

      {highlightSector &&
        cells.map((cell) => {
          if (sectorOf.get(cell.nodeId as string) !== highlightSector) return null;
          return (
            <polygon
              key={`h${cell.nodeId as string}`}
              points={polygonPoints(cell.points)}
              fill="none"
              style={{ stroke: 'var(--color-highlight)' }}
              strokeWidth={0.55}
              strokeDasharray="1.4 0.6"
            />
          );
        })}
    </g>
  );
}

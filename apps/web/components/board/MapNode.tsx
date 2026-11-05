import type { MapNode as MapNodeType, NodeRuntime, Sector } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';
import { SECTOR_COLOR, SECTOR_TAG, SECTOR_TERRITORY, sectorShapeGeometry } from '../../lib/sectors.js';

export interface MapNodeProps {
  node: MapNodeType;
  /** This node's runtime state, or undefined when it's outside fog. Absence
   *  IS the fogged state — no placeholder marker stands in for it. */
  runtime: NodeRuntime | undefined;
  /** Round the node reopens, or undefined when it isn't currently blockaded. */
  blockadedUntil: number | undefined;
  /** Round a publicly announced blockade will close this node, if any. */
  closesInRound: number | undefined;
  /** The viewer's own player id — to tell their informant from a rival's. */
  selfId: string | null;
  /** The viewer's faction — their own extraction point is called out. */
  faction: Sector | null;
  selected: boolean;
  focused: boolean;
  /** Invisible hit-target radius in viewBox units (≥ 44px on screen). */
  hitRadius: number;
  onSelect: () => void;
  onHover?: (hovering: boolean) => void;
}

export const NODE_SIZE = 4.4;

/**
 * One node: sector silhouette, label, and the public/own runtime markers.
 * Every marker is driven by data — no lookup table keyed by node id
 * (apps/web/components/board/CLAUDE.md rule 1). Fog is absence: a node
 * missing from `visibleNodes` (runtime undefined) renders no dossier or
 * informant-claim state and is drawn faded, never with a hidden stand-in
 * (rule 2).
 */
export function MapNode({
  node,
  runtime,
  blockadedUntil,
  closesInRound,
  selfId,
  faction,
  selected,
  focused,
  hitRadius,
  onSelect,
  onHover,
}: MapNodeProps) {
  const { cx, cy } = projectNode(node);
  const inSight = runtime !== undefined;
  const dossiers = runtime?.dossiers ?? 0;
  const owner = runtime?.informantOwner ?? null;
  const isBlockaded = blockadedUntil !== undefined;
  const ink = SECTOR_COLOR[node.sector];
  const shape = sectorShapeGeometry(node.sector, cx, cy, NODE_SIZE);
  const ownExtraction = node.extractionFor !== null && node.extractionFor === faction;
  const h = NODE_SIZE / 2;

  const labelParts = [
    node.name,
    `${SECTOR_TERRITORY[node.sector]} (${node.sector})`,
    node.isUBahnStation ? 'U-Bahn station' : null,
    node.hasInformant ? (owner === null ? 'informant' : owner === selfId ? 'your informant' : 'informant taken') : null,
    node.extractionFor ? `extraction point for ${node.extractionFor}` : null,
    dossiers > 0 ? `${dossiers} dossier${dossiers === 1 ? '' : 's'}` : null,
    isBlockaded ? `sealed until round ${blockadedUntil}` : null,
    closesInRound !== undefined ? `blockade announced for round ${closesInRound}` : null,
    inSight ? 'in sight' : 'out of sight',
  ].filter((part): part is string => part !== null);

  return (
    <g data-node-id={node.id as string} opacity={inSight ? 1 : 0.6}>
      {node.extractionFor && (
        <circle
          cx={cx}
          cy={cy}
          r={h + 1.6}
          fill="none"
          style={{ stroke: SECTOR_COLOR[node.extractionFor] }}
          strokeWidth={ownExtraction ? 0.55 : 0.35}
          strokeDasharray={ownExtraction ? '0.9 0.5' : '0.5 0.6'}
        />
      )}

      {selected && (
        <circle cx={cx} cy={cy} r={h + 2.4} fill="none" style={{ stroke: 'var(--color-accent)' }} strokeWidth={0.6} />
      )}
      {focused && (
        <circle
          cx={cx}
          cy={cy}
          r={h + 3.1}
          fill="none"
          style={{ stroke: 'var(--color-ink)' }}
          strokeWidth={0.35}
          strokeDasharray="0.6 0.6"
        />
      )}

      {shape.kind === 'circle' ? (
        <circle cx={shape.cx} cy={shape.cy} r={shape.r} style={{ fill: 'var(--color-paper)', stroke: ink }} strokeWidth={0.62} />
      ) : (
        <polygon points={shape.points} style={{ fill: 'var(--color-paper)', stroke: ink }} strokeWidth={0.62} strokeLinejoin="round" />
      )}

      {node.isUBahnStation ? (
        <text
          x={cx}
          y={cy + (node.sector === 'GREEN' ? 0.95 : 0.75)}
          textAnchor="middle"
          fontSize={2.3}
          fontWeight={700}
          style={{ fill: ink }}
        >
          U
        </text>
      ) : (
        <circle cx={cx} cy={cy} r={0.6} style={{ fill: ink }} />
      )}

      {node.hasInformant && (
        <g aria-hidden="true">
          <circle
            cx={cx + h + 0.9}
            cy={cy - h - 0.5}
            r={1.05}
            style={{
              fill: owner === null ? 'var(--color-paper)' : owner === selfId ? 'var(--color-accent)' : 'var(--color-ink)',
              stroke: owner === null ? 'var(--color-ink-muted)' : 'var(--color-paper)',
            }}
            strokeWidth={0.22}
          />
          <text
            x={cx + h + 0.9}
            y={cy - h - 0.5 + 0.62}
            textAnchor="middle"
            fontSize={1.6}
            fontWeight={700}
            style={{ fill: owner === null ? 'var(--color-ink-muted)' : 'var(--color-paper)' }}
          >
            i
          </text>
        </g>
      )}

      {dossiers > 0 && (
        <g aria-hidden="true" transform={`translate(${cx - h - 3.1} ${cy - h - 1.6})`}>
          {/* A manila folder with the count typed on it. */}
          <path d="M 0 0.45 L 0.9 0.45 L 1.2 0 L 2.6 0 L 2.6 2.1 L 0 2.1 Z" style={{ fill: 'var(--color-manila-2)', stroke: 'var(--color-ink)' }} strokeWidth={0.16} />
          <text x={1.3} y={1.75} textAnchor="middle" fontSize={1.45} fontWeight={700} style={{ fill: 'var(--color-ink)' }}>
            {dossiers}
          </text>
        </g>
      )}

      {closesInRound !== undefined && !isBlockaded && (
        <g aria-hidden="true">
          <circle cx={cx} cy={cy} r={h + 1.1} fill="none" style={{ stroke: 'var(--color-stamp)' }} strokeWidth={0.4} strokeDasharray="0.5 0.45" />
          <text x={cx} y={cy - h - 2.1} textAnchor="middle" fontSize={1.45} fontWeight={700} style={{ fill: 'var(--color-stamp)' }}>
            CLOSES R{closesInRound}
          </text>
        </g>
      )}

      {isBlockaded && (
        <g aria-hidden="true">
          <line x1={cx - h - 0.6} y1={cy - h - 0.6} x2={cx + h + 0.6} y2={cy + h + 0.6} style={{ stroke: 'var(--color-stamp)' }} strokeWidth={0.75} strokeLinecap="round" />
          <line x1={cx + h + 0.6} y1={cy - h - 0.6} x2={cx - h - 0.6} y2={cy + h + 0.6} style={{ stroke: 'var(--color-stamp)' }} strokeWidth={0.75} strokeLinecap="round" />
          <text x={cx} y={cy - h - 2.1} textAnchor="middle" fontSize={1.45} fontWeight={700} style={{ fill: 'var(--color-stamp)' }}>
            SEALED → R{blockadedUntil}
          </text>
        </g>
      )}

      <text
        x={cx}
        y={cy + h + 2.55}
        textAnchor="middle"
        fontSize={2.05}
        fontWeight={700}
        className="board-label"
        style={{ fill: 'var(--color-ink)' }}
      >
        {node.name}
      </text>
      {node.extractionFor && (
        <text
          x={cx}
          y={cy + h + 4.45}
          textAnchor="middle"
          fontSize={1.4}
          fontWeight={700}
          letterSpacing={0.18}
          className="board-label"
          style={{ fill: SECTOR_COLOR[node.extractionFor] }}
        >
          {ownExtraction ? 'YOUR EXTRACTION' : `EXTRACT · ${SECTOR_TAG[node.extractionFor]}`}
        </text>
      )}

      {/* Invisible hit target, 44px minimum diameter — the rendered shape
          above can be, and is, smaller. */}
      <circle
        cx={cx}
        cy={cy}
        r={hitRadius}
        fill="transparent"
        onClick={onSelect}
        onMouseEnter={onHover ? () => onHover(true) : undefined}
        onMouseLeave={onHover ? () => onHover(false) : undefined}
        role="button"
        aria-label={labelParts.join(', ')}
        style={{ cursor: 'pointer' }}
      />
    </g>
  );
}

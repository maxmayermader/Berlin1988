import type { MapNode as MapNodeType, NodeRuntime, Sector } from '@berlin/shared';
import { HIT_TARGET_PX, projectNode } from '../../lib/board.js';

export interface MapNodeProps {
  node: MapNodeType;
  /** This node's runtime state, or undefined when it's outside fog. Absence
   *  IS the fogged state — no placeholder marker stands in for it. */
  runtime: NodeRuntime | undefined;
  /** Round the node reopens, or undefined when it isn't currently blockaded. */
  blockadedUntil: number | undefined;
  selected: boolean;
  focused: boolean;
  onSelect: () => void;
}

const NEUTRAL_STROKE = '#94a3b8';
const NEUTRAL_FILL = '#ffffff';
const SHAPE_SIZE = 4.5;

/**
 * The board is a fixed-size 0-100 viewBox rendered responsively; there is no
 * live measurement of its on-screen pixel size at this layer. ASSUMED_BOARD_PX
 * is a documented design assumption (a typical rendered board width) used
 * only to translate the UI-SPEC's 44px minimum hit-target into viewBox units
 * — the *visual* node shape stays small (SHAPE_SIZE), the invisible click
 * target does not.
 */
const ASSUMED_BOARD_PX = 480;
const HIT_RADIUS_VB = (HIT_TARGET_PX / 2 / ASSUMED_BOARD_PX) * 100;

const SECTOR_LABEL: Record<Sector, string> = {
  RED: 'RED',
  BLUE: 'BLUE',
  GOLD: 'GOLD',
  GREEN: 'GRN',
};

/**
 * Sector is encoded by shape, never by color alone — apps/web/CLAUDE.md
 * rule 4 and apps/web/components/CLAUDE.md. Every shape uses the same
 * neutral stroke/fill; only the outline differs.
 */
function SectorShape({ sector, cx, cy }: { sector: Sector; cx: number; cy: number }) {
  const common = { fill: NEUTRAL_FILL, stroke: NEUTRAL_STROKE, strokeWidth: 0.6 };
  switch (sector) {
    case 'BLUE':
      return (
        <rect
          x={cx - SHAPE_SIZE / 2}
          y={cy - SHAPE_SIZE / 2}
          width={SHAPE_SIZE}
          height={SHAPE_SIZE}
          {...common}
        />
      );
    case 'GOLD':
      return (
        <rect
          x={cx - SHAPE_SIZE / 2}
          y={cy - SHAPE_SIZE / 2}
          width={SHAPE_SIZE}
          height={SHAPE_SIZE}
          transform={`rotate(45 ${cx} ${cy})`}
          {...common}
        />
      );
    case 'GREEN': {
      const h = SHAPE_SIZE;
      const points = [
        [cx, cy - h / 2],
        [cx - h / 2, cy + h / 2],
        [cx + h / 2, cy + h / 2],
      ]
        .map((p) => p.join(','))
        .join(' ');
      return <polygon points={points} {...common} />;
    }
    case 'RED':
    default:
      return <circle cx={cx} cy={cy} r={SHAPE_SIZE / 2} {...common} />;
  }
}

/**
 * One node: shape (sector), label, fog-aware markers. Every marker is driven
 * by data — no lookup table keyed by node id (apps/web/components/board/CLAUDE.md
 * rule 1). Fog is absence: a node missing from `visibleNodes` (runtime
 * undefined) simply renders no dossier/informant-claim state, never a
 * hidden or zero-opacity stand-in (rule 2).
 */
export function MapNode({ node, runtime, blockadedUntil, selected, focused, onSelect }: MapNodeProps) {
  const { cx, cy } = projectNode(node);
  const dossiers = runtime?.dossiers ?? 0;
  const isBlockaded = blockadedUntil !== undefined;
  const labelY = cy + SHAPE_SIZE / 2 + (node.extractionFor ? 4.6 : 2.4);

  return (
    <g>
      <SectorShape sector={node.sector} cx={cx} cy={cy} />

      {selected && (
        <circle cx={cx} cy={cy} r={SHAPE_SIZE / 2 + 1.2} fill="none" stroke="#2563eb" strokeWidth={0.7} />
      )}
      {focused && (
        <circle
          cx={cx}
          cy={cy}
          r={SHAPE_SIZE / 2 + 2}
          fill="none"
          stroke="#0f172a"
          strokeWidth={0.4}
          strokeDasharray="0.6 0.6"
        />
      )}

      {node.isUBahnStation && (
        <text x={cx} y={cy + 0.4} textAnchor="middle" fontSize={2.4} fontWeight={600} fill="#0f172a">
          U
        </text>
      )}
      {node.hasInformant && (
        <text x={cx + SHAPE_SIZE / 2 + 1.4} y={cy - SHAPE_SIZE / 2} textAnchor="middle" fontSize={2} fill="#64748b">
          i
        </text>
      )}
      {dossiers > 0 && (
        <text
          x={cx - SHAPE_SIZE / 2 - 1.4}
          y={cy - SHAPE_SIZE / 2}
          textAnchor="middle"
          fontSize={2}
          fontWeight={600}
          fill="#0f172a"
        >
          {dossiers}
        </text>
      )}
      {isBlockaded && (
        <line
          x1={cx - SHAPE_SIZE / 2}
          y1={cy - SHAPE_SIZE / 2}
          x2={cx + SHAPE_SIZE / 2}
          y2={cy + SHAPE_SIZE / 2}
          stroke="#64748b"
          strokeWidth={0.5}
        />
      )}
      {node.extractionFor && (
        <text x={cx} y={cy + SHAPE_SIZE / 2 + 2.4} textAnchor="middle" fontSize={1.6} fill="#64748b">
          EXTRACT · {SECTOR_LABEL[node.extractionFor]}
        </text>
      )}

      <text x={cx} y={labelY} textAnchor="middle" fontSize={2} fontWeight={400} fill="#0f172a">
        {node.name}
      </text>

      {/* Invisible hit target, HIT_TARGET_PX (44px) minimum diameter — the
          rendered shape above can be, and is, smaller. */}
      <circle
        cx={cx}
        cy={cy}
        r={HIT_RADIUS_VB}
        fill="transparent"
        onClick={onSelect}
        role="button"
        aria-label={node.name}
        style={{ cursor: 'pointer' }}
      />
    </g>
  );
}

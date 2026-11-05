import type { MapDefinition, NodeId } from '@berlin/shared';
import { projectNode } from '../../lib/board.js';
import type { BeatTone, ReplayBeat } from '../../lib/replay.js';
import { ARROW_IDS } from './BoardDefs.js';

export interface BeatOverlayProps {
  map: MapDefinition;
  /** The beat for the most recently revealed event, or null. */
  beat: ReplayBeat | null;
  /** The reveal index — changing it restarts the beat's entrance. */
  beatKey: number;
}

const TONE_INK: Record<BeatTone, string> = {
  neutral: 'var(--color-ink)',
  move: 'var(--color-accent)',
  danger: 'var(--color-stamp)',
  intel: 'var(--color-ok)',
  success: 'var(--color-ok)',
  warning: 'var(--color-warn)',
};

const TONE_ARROW: Record<BeatTone, string> = {
  neutral: ARROW_IDS.accent,
  move: ARROW_IDS.accent,
  danger: ARROW_IDS.stamp,
  intel: ARROW_IDS.ok,
  success: ARROW_IDS.ok,
  warning: ARROW_IDS.warn,
};

/** Big stamped word over the primary node, for the beats that carry weight
 *  (apps/web/components/board/CLAUDE.md rule 3: a blockade lands with
 *  weight; a contested roll shows the die). */
const GLYPH_WORD: Partial<Record<ReplayBeat['glyph'], string>> = {
  strike: 'STRIKE',
  burn: 'BURNED',
  trap: 'TRAP',
  blockade: 'SEALED',
  contest: '⚄ CONTEST',
  extract: 'EXTRACTED',
  dossier: 'DOSSIER',
  wiretap: 'WIRETAP',
  informant: 'BOUGHT',
  safehouse: 'SAFEHOUSE',
  decoy: 'DECOY',
  checkpoint: 'CROSSING',
};

/**
 * The replay beat on the map: a pulse on each node the event names, an
 * arrow for movement or a line of fire, and a stamped word. Only the nodes
 * the event itself carries are ever drawn (lib/replay.ts) — the overlay
 * has no other input, so it cannot show what the viewer's fog withheld.
 */
export function BeatOverlay({ map, beat, beatKey }: BeatOverlayProps) {
  if (!beat || (beat.nodes.length === 0 && !beat.arrow)) return null;
  const at = (id: NodeId) => {
    const node = map.nodes.find((n) => n.id === id);
    return node ? projectNode(node) : null;
  };
  const ink = TONE_INK[beat.tone];
  const primary = beat.nodes[0] ? at(beat.nodes[0]) : null;
  const word = GLYPH_WORD[beat.glyph];

  let arrow: { x1: number; y1: number; x2: number; y2: number; bend: string } | null = null;
  if (beat.arrow) {
    const a = at(beat.arrow.from);
    const b = at(beat.arrow.to);
    if (a && b) {
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const len = Math.hypot(dx, dy) || 1;
      const x1 = a.cx + (dx / len) * 2.8;
      const y1 = a.cy + (dy / len) * 2.8;
      const x2 = b.cx - (dx / len) * 3.6;
      const y2 = b.cy - (dy / len) * 3.6;
      const mx = (x1 + x2) / 2 - dy * 0.12;
      const my = (y1 + y2) / 2 + dx * 0.12;
      arrow = { x1, y1, x2, y2, bend: `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}` };
    }
  }

  return (
    <g key={beatKey} pointerEvents="none" aria-hidden="true" data-beat={beat.glyph}>
      {beat.nodes.map((id, i) => {
        const p = at(id);
        if (!p) return null;
        return (
          <g key={`${id as string}-${i}`}>
            <circle
              cx={p.cx}
              cy={p.cy}
              r={i === 0 ? 4.4 : 3.4}
              fill="none"
              style={{ stroke: ink }}
              strokeWidth={i === 0 ? 0.7 : 0.45}
            />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={i === 0 ? 4.4 : 3.4}
              fill="none"
              style={{ stroke: ink }}
              strokeWidth={0.5}
              className="beat-pulse animate-beat-pulse"
            />
          </g>
        );
      })}

      {arrow && (
        <path
          d={arrow.bend}
          fill="none"
          style={{ stroke: ink }}
          strokeWidth={0.75}
          strokeLinecap="round"
          strokeDasharray={beat.glyph === 'strike' ? '0.4 0.7' : undefined}
          markerEnd={`url(#${TONE_ARROW[beat.tone]})`}
        />
      )}

      {primary && word && (
        <g transform={`translate(${primary.cx} ${primary.cy - 7.4}) rotate(-5)`}>
          <rect
            x={-word.length * 0.66 - 0.9}
            y={-1.75}
            width={word.length * 1.32 + 1.8}
            height={2.6}
            rx={0.35}
            style={{ fill: 'var(--color-paper)', stroke: ink, ['--stamp-tilt' as string]: '0deg' }}
            strokeWidth={0.38}
            className="beat-pulse animate-stamp-in"
          />
          <text
            y={0.2}
            textAnchor="middle"
            fontSize={1.9}
            letterSpacing={0.15}
            className="beat-pulse animate-stamp-in"
            style={{ fill: ink, fontFamily: 'var(--font-display)', ['--stamp-tilt' as string]: '0deg' }}
          >
            {word}
          </text>
        </g>
      )}
    </g>
  );
}

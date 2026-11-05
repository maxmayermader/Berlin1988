import type { NodeId, PlayerView } from '@berlin/shared';
import { nodeName } from '../../lib/format.js';
import { SECTOR_TERRITORY } from '../../lib/sectors.js';
import { SectorGlyph } from '../intel/SectorGlyph.js';

export interface NodeInspectorProps {
  view: PlayerView;
  /** The node under the pointer or keyboard focus, else the active agent's. */
  nodeId: NodeId | null;
}

/**
 * A one-line reading of a node — the text form of everything the board
 * draws on it (apps/web/CLAUDE.md rule 4: every signal has a text form).
 * Runtime facts (dossiers, informant owner) only appear when the node is in
 * the viewer's sight, because only then are they in `visibleNodes`.
 */
export function NodeInspector({ view, nodeId }: NodeInspectorProps) {
  const node = nodeId ? view.map.nodes.find((n) => n.id === nodeId) : undefined;
  if (!node) {
    return (
      <p className="desk-surface rounded-[3px] px-3 py-2 text-sm text-on-desk-muted">
        Hover or tab onto a node to read it.
      </p>
    );
  }

  const runtime = view.visibleNodes[node.id as string];
  const sealedUntil = view.activeBlockades[node.id as string];
  const facts: string[] = [];
  if (node.isUBahnStation) facts.push('U-Bahn');
  if (node.extractionFor) facts.push(`extraction for ${node.extractionFor}`);
  if (node.hasInformant) {
    const owner = runtime?.informantOwner ?? null;
    facts.push(
      runtime === undefined
        ? 'informant'
        : owner === null
          ? 'informant for sale'
          : owner === view.self.id
            ? 'your informant'
            : 'informant taken',
    );
  }
  if (runtime && runtime.dossiers > 0) facts.push(`${runtime.dossiers} dossier${runtime.dossiers === 1 ? '' : 's'}`);
  if (sealedUntil !== undefined) facts.push(`sealed until R${sealedUntil}`);
  if (view.self.safehouse === node.id) facts.push('your safehouse');
  if (view.self.traps.some((t) => t.nodeId === node.id)) facts.push('your ambush');

  const neighbours = node.edges.map((e) => {
    const how = e.type === 'TUNNEL' ? ' (tunnel)' : e.type === 'CHECKPOINT' ? ' (checkpoint)' : '';
    return `${nodeName(view.map, e.to)}${how}`;
  });

  return (
    <div className="desk-surface flex flex-col gap-1 rounded-[3px] px-3 py-2 text-sm" aria-live="polite">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <SectorGlyph sector={node.sector} size={13} filled={false} />
        <b className="text-on-desk">{node.name}</b>
        <span className="text-on-desk-muted">
          {SECTOR_TERRITORY[node.sector]} · {runtime ? 'in sight' : 'out of sight'}
        </span>
        {facts.length > 0 && <span className="text-on-desk">· {facts.join(' · ')}</span>}
      </p>
      <p className="text-[0.78rem] text-on-desk-muted">Connects to {neighbours.join(', ')}.</p>
    </div>
  );
}

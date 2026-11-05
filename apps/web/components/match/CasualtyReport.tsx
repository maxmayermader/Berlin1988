import type { MapDefinition, NodeId } from '@berlin/shared';
import { nodeName } from '../../lib/format.js';
import { Stamp } from '../ui/Stamp.js';

export interface CasualtyReportProps {
  map: MapDefinition;
  /** From `ownBurnsIn(view.lastRound, selfId)` — the viewer's own losses. */
  burns: readonly { readonly agentId: string | null; readonly cause: string; readonly nodeId: string }[];
  /** The viewer's own agent ids → "Agent 1" / "Agent 2". */
  agentLabels: Readonly<Record<string, string>>;
}

const CAUSE_TEXT: Record<string, string> = {
  STRIKE: 'struck down',
  AMBUSH: 'caught in an ambush',
  BLOCKADE: 'trapped by a blockade',
  CONTEST: 'lost a contested node',
};

/**
 * BURN-02: told in the round it happens that an agent burned, and what
 * burned it as far as fog allows — read from the viewer's own filtered log.
 */
export function CasualtyReport({ map, burns, agentLabels }: CasualtyReportProps) {
  if (burns.length === 0) return null;
  return (
    <div className="relative rounded-[3px] border-2 border-stamp bg-stamp-wash p-3" role="alert">
      <div className="absolute -right-2 -top-3">
        <Stamp tilt={6} animate className="bg-stamp-wash text-sm">
          Casualty
        </Stamp>
      </div>
      <h3 className="label-caps text-stamp">Agent lost this round</h3>
      <ul className="mt-1 flex flex-col gap-0.5 text-sm">
        {burns.map((burn, i) => (
          <li key={i}>
            <b>{(burn.agentId && agentLabels[burn.agentId]) ?? 'Your agent'}</b> —{' '}
            {CAUSE_TEXT[burn.cause] ?? 'burned'} at {nodeName(map, burn.nodeId as NodeId)}.
          </li>
        ))}
      </ul>
    </div>
  );
}

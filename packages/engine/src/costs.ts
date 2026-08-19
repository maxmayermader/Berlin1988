import type { MapDefinition, NodeId, Ruleset } from '@berlin/shared';
import { edgeBetween } from './graph.js';
import { hasPassive, type PassiveHolder } from './passives.js';

/**
 * Movement tolls. Shared by legalOrders (affordability preview) and the
 * resolution pipeline (actually charging) so the two can never disagree.
 */

export interface EdgeCost {
  readonly intel: number;
  readonly viaTunnel: boolean;
  readonly viaCheckpoint: boolean;
  /** Forged Papers suppresses the public Border Crossing signal. */
  readonly silentCrossing: boolean;
}

/** Null when the two nodes are not connected. */
export function edgeCost(
  map: MapDefinition,
  from: NodeId,
  to: NodeId,
  holder: PassiveHolder,
  ruleset: Ruleset,
): EdgeCost | null {
  const type = edgeBetween(map, from, to);
  if (type === null) return null;

  if (type === 'TUNNEL') {
    return {
      intel: ruleset.tunnelIntelCost,
      viaTunnel: true,
      viaCheckpoint: false,
      silentCrossing: false,
    };
  }

  if (type === 'CHECKPOINT') {
    const papers = hasPassive(holder, 'FORGED_PAPERS');
    return {
      intel: papers ? 0 : ruleset.checkpointIntelCost,
      viaTunnel: false,
      viaCheckpoint: true,
      silentCrossing: papers,
    };
  }

  return { intel: 0, viaTunnel: false, viaCheckpoint: false, silentCrossing: false };
}

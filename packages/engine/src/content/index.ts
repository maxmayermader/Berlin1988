import type { MapDefinition } from '@berlin/shared';
import { DUEL_12 } from './maps/duel12.js';
import { FFA_16 } from './maps/ffa16.js';
import { FFA_18 } from './maps/ffa18.js';

export * from './cards.js';
export * from './rulesets.js';
export * from './loadouts.js';
export { DUEL_12, FFA_16, FFA_18 };

/** Keyed by the `mapId` a MatchSettings carries. `mapIdForPlayerCount` in
 *  @berlin/shared is what chooses between them (MAP-03); nothing else should
 *  hardcode one of these ids. */
export const MAPS: Record<string, MapDefinition> = {
  'duel-12': DUEL_12,
  'ffa-16': FFA_16,
  'ffa-18': FFA_18,
};

export function getMap(id: string): MapDefinition {
  const m = MAPS[id];
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}

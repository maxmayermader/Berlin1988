import type { MapDefinition } from '@berlin/shared';
import { DUEL_12 } from './maps/duel12.js';

export * from './cards.js';
export * from './rulesets.js';
export * from './loadouts.js';
export { DUEL_12 };

export const MAPS: Record<string, MapDefinition> = {
  'duel-12': DUEL_12,
};

export function getMap(id: string): MapDefinition {
  const m = MAPS[id];
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}

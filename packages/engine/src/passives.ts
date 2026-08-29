import type { CardId, PassiveEffect, PlayerSecrets } from '@berlin/shared';
import { tryGetCard } from './content/cards.js';

/**
 * Passive lookup helpers. A permanent passive is checked against the loadout;
 * a consumable is checked against passivesAvailable, which shrinks as they fire.
 *
 * Deliberately structural rather than typed to PlayerSecrets: legalOrders runs
 * against a PlayerView's SelfView, and both must get the same answer.
 */
export interface PassiveHolder {
  readonly loadout: readonly CardId[];
  readonly passivesAvailable: readonly CardId[];
}

/** Does this player have the effect available right now? */
export function hasPassive(p: PassiveHolder, effect: PassiveEffect): boolean {
  return findPassive(p, effect) !== null;
}

/** The card id granting this effect, or null if unavailable or already spent. */
export function findPassive(
  p: PassiveHolder,
  effect: PassiveEffect,
): CardId | null {
  for (const id of p.loadout) {
    const c = tryGetCard(id);
    if (!c || c.kind !== 'PASSIVE' || c.effect !== effect) continue;
    if (!c.consumable) return id;
    if (p.passivesAvailable.includes(id)) return id;
  }
  return null;
}

/** Remove a consumable from the available pool. No-op for permanents. */
export function consumePassive(p: PlayerSecrets, id: CardId): boolean {
  const c = tryGetCard(id);
  if (!c || c.kind !== 'PASSIVE') return false;
  if (!c.consumable) return false;
  const i = p.passivesAvailable.indexOf(id);
  if (i < 0) return false;
  p.passivesAvailable.splice(i, 1);
  return true;
}

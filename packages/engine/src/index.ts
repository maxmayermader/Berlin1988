/**
 * @berlin/engine — the rules of Berlin 1988 as pure functions.
 *
 * Pure: no Math.random(), no Date.now(), no fetch, no console, no filesystem.
 * Deterministic: (seed, settings, orders) fully reconstructs a match.
 * Total: illegal orders return a rejection, they don't throw.
 * Framework-free: runs in a bare Node loop.
 *
 * projectView() is a SECURITY BOUNDARY — the only sanctioned way for state to
 * leave this package toward a client.
 */

export { createMatch, quickSettings } from './createMatch.js';
export { legalOrders, isLegal, sameAction, inStrikeRange } from './legalOrders.js';
export { submitOrder, allCommitted, autoHoldMissing, viewForOrdering } from './submitOrder.js';
export type { SubmitResult } from './submitOrder.js';
export { resolveRound } from './resolution/index.js';
export { projectView } from './fog/projectView.js';

export { checkVictory, scoreOf, agentsAlive } from './victory.js';
export { validateLoadout, budgetPointsOf, consumablePassivesIn } from './loadout.js';
export { hasPassive, findPassive } from './passives.js';
export { isReady, remaining as cooldownRemaining } from './cooldowns.js';
export { consumesAction, actionsUsed, actionBudget, maxFreeActions } from './actionBudget.js';
export {
  actionIntelCost,
  costOfOrder,
  intelAvailableFor,
  viewForComposing,
} from './actionCost.js';
export { seedRng, next as rngNext, nextInt, chance, shuffled } from './rng.js';

export * from './graph.js';
export * from './content/index.js';

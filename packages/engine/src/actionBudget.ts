import type { Action, AgentState, Ruleset } from '@berlin/shared';

/**
 * Action accounting.
 *
 * Most actions cost one of an agent's two slots. Ambush is the exception: it
 * costs Intel but no action (docs/GAME_DESIGN.md §5.1), so laying a trap no
 * longer competes with moving or striking — Intel and the Strike card's
 * cooldown are its only brakes.
 *
 * The rule is expressed as a ruleset flag rather than hardcoded, so the sim
 * harness can sweep it: making traps free in tempo terms is a significant
 * balance change and we should be able to measure it both ways.
 */
export function consumesAction(action: Action, ruleset: Ruleset): boolean {
  if (action.type === 'AMBUSH') return ruleset.ambushCostsAction;
  return true;
}

/** How many of an agent's slots this list actually uses. */
export function actionsUsed(
  actions: readonly Action[],
  ruleset: Ruleset,
): number {
  let n = 0;
  for (const a of actions) if (consumesAction(a, ruleset)) n++;
  return n;
}

/** Slots available to an agent this round, after any blockade penalty. */
export function actionBudget(agent: AgentState, ruleset: Ruleset): number {
  return Math.max(0, ruleset.actionsPerAgent - agent.actionPenalty);
}

/**
 * Free actions still need a ceiling. An agent can only trap the node it is
 * standing on, and it cannot trap the same node twice, so one ambush per agent
 * per round falls out naturally — this just makes it explicit and bounds the
 * order array for anything validating untrusted input.
 */
export function maxFreeActions(ruleset: Ruleset): number {
  return ruleset.ambushCostsAction ? 0 : 1;
}

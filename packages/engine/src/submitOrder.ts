import type {
  Action,
  AgentOrder,
  GameState,
  OrderRejection,
  PlayerId,
  PlayerView,
} from '@berlin/shared';
import { projectView } from './fog/projectView.js';
import { legalOrders, sameAction } from './legalOrders.js';
import { getCard, isActive } from './content/cards.js';
import { edgeCost } from './costs.js';
import { actionBudget, actionsUsed, maxFreeActions } from './actionBudget.js';

export interface SubmitResult {
  readonly state: GameState;
  readonly rejection: OrderRejection | null;
}

/**
 * Validate and record one agent's actions for the current round.
 *
 * Illegal orders do not throw — they come back as a rejection carried on the
 * returned state. Exceptions are for bugs, never for rule violations.
 *
 * Validation runs against a projected PlayerView, so a player can only order
 * what they can actually see. It also runs in CANONICAL order (movement first),
 * matching how the pipeline will resolve them — otherwise a player could list
 * STRIKE before MOVE and get a range check against the wrong node.
 */
export function submitOrder(
  state: GameState,
  player: PlayerId,
  order: AgentOrder,
): SubmitResult {
  const reject = (
    code: OrderRejection['code'],
    message: string,
  ): SubmitResult => ({
    state,
    rejection: { agentId: order.agentId, code, message },
  });

  if (state.phase !== 'ORDERS') {
    return reject('WRONG_PHASE', `Match is in phase ${state.phase}.`);
  }

  const p = state.players[player as string];
  const agent = p?.agents.find((a) => a.id === order.agentId);
  if (!p || !agent) {
    return reject('NOT_YOUR_AGENT', `Agent ${order.agentId} does not belong to ${player}.`);
  }
  if (!agent.alive) {
    return reject('AGENT_DEAD', 'That agent has been burned.');
  }

  // Ambush costs Intel but no action, so the budget counts only the actions
  // that actually consume a slot. The array length is still bounded so untrusted
  // input can't submit a thousand free actions.
  const budget = actionBudget(agent, state.ruleset);
  const used = actionsUsed(order.actions, state.ruleset);
  const free = order.actions.length - used;
  if (used > budget || free > maxFreeActions(state.ruleset)) {
    return reject(
      'TOO_MANY_ACTIONS',
      `Agent has ${budget} action slot(s) this round; got ${used} plus ${free} free.`,
    );
  }

  // A player's agents share one Intel pool. Without this, two agents could each
  // validate against the full balance and overspend between them.
  const view = viewWithCommittedSpend(state, player, order.agentId);

  const canonical = [...order.actions].sort(
    (a, b) => movementFirst(a) - movementFirst(b),
  );

  const prefix: Action[] = [];
  for (const action of canonical) {
    if (!legalOrders(view, order.agentId, prefix).some((x) => sameAction(x, action))) {
      return reject('ILLEGAL_ACTION', `Illegal action: ${describe(action)}`);
    }
    prefix.push(action);
  }

  const next: GameState = {
    ...state,
    pendingOrders: { ...state.pendingOrders, [order.agentId as string]: order },
  };
  return { state: next, rejection: null };
}

/** Have all live agents committed? The room closes the round on this. */
export function allCommitted(state: GameState): boolean {
  for (const pid of state.playerOrder) {
    const p = state.players[pid as string]!;
    if (p.eliminated) continue;
    for (const a of p.agents) {
      if (!a.alive) continue;
      if (!state.pendingOrders[a.id as string]) return false;
    }
  }
  return true;
}

/** Every live agent with no committed order Holds — banking Intel, not forfeiting. */
export function autoHoldMissing(state: GameState): GameState {
  const pending = { ...state.pendingOrders };
  for (const pid of state.playerOrder) {
    const p = state.players[pid as string]!;
    if (p.eliminated) continue;
    for (const a of p.agents) {
      if (!a.alive || pending[a.id as string]) continue;
      const budget = actionBudget(a, state.ruleset);
      pending[a.id as string] = {
        agentId: a.id,
        actions: Array.from({ length: budget }, () => ({ type: 'HOLD' as const })),
      };
    }
  }
  return { ...state, pendingOrders: pending };
}

/**
 * The view to compose an agent's order against: identical to projectView, but
 * with Intel reduced by what this player's OTHER agents have already committed
 * this round.
 *
 * Anything picking actions must use this rather than projectView, or a player
 * with two agents will happily plan two orders that each fit the budget and
 * together don't. The client does the same subtraction locally from its own
 * pending orders.
 */
export function viewForOrdering(
  state: GameState,
  player: PlayerId,
  agentId: string,
): PlayerView {
  return viewWithCommittedSpend(state, player, agentId);
}

function viewWithCommittedSpend(
  state: GameState,
  player: PlayerId,
  excludeAgent: string,
): PlayerView {
  const view = projectView(state, player);
  const p = state.players[player as string]!;

  let committed = 0;
  for (const agent of p.agents) {
    if ((agent.id as string) === excludeAgent) continue;
    const order = state.pendingOrders[agent.id as string];
    if (!order) continue;
    committed += intelCostOf(state, player, agent.nodeId, order);
  }

  if (committed === 0) return view;
  return { ...view, self: { ...view.self, intel: Math.max(0, view.self.intel - committed) } };
}

function intelCostOf(
  state: GameState,
  player: PlayerId,
  from: Parameters<typeof edgeCost>[1],
  order: AgentOrder,
): number {
  const p = state.players[player as string]!;
  const rs = state.ruleset;
  let total = (order.buySilencers ?? 0) * rs.silencerIntelCost;
  let pos = from;

  for (const action of order.actions) {
    switch (action.type) {
      case 'HOLD':
        break;
      case 'MOVE': {
        total += edgeCost(state.map, pos, action.to, p, rs)?.intel ?? 0;
        pos = action.to;
        break;
      }
      case 'SPRINT': {
        total += edgeCost(state.map, pos, action.via, p, rs)?.intel ?? 0;
        total += edgeCost(state.map, action.via, action.to, p, rs)?.intel ?? 0;
        if (!action.cardId) total += rs.sprintIntelCost;
        pos = action.to;
        break;
      }
      case 'AMBUSH':
        total += rs.ambushIntelCost;
        break;
      default: {
        const card = getCard(action.cardId);
        if (isActive(card)) total += card.intelCost;
        break;
      }
    }
  }
  return total;
}

/** Movement sorts first so range checks see post-movement positions. */
function movementFirst(a: Action): number {
  return a.type === 'MOVE' || a.type === 'SPRINT' ? 0 : 1;
}

function describe(a: Action): string {
  switch (a.type) {
    case 'HOLD':
      return 'HOLD';
    case 'MOVE':
      return `MOVE -> ${a.to}`;
    case 'SPRINT':
      return `SPRINT -> ${a.via} -> ${a.to}`;
    case 'BRIBE':
    case 'SAFEHOUSE':
    case 'AMBUSH':
      return `${a.type} (${a.cardId})`;
    default:
      return `${a.type} (${a.cardId}) -> ${a.target}`;
  }
}

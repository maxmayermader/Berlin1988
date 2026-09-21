import type { Action, AgentId, PlayerView } from '@berlin/shared';
import { getCard, isActive } from './content/cards.js';
import { edgeCost } from './costs.js';

/**
 * What one action costs its agent in Intel, computed from a PlayerView alone.
 *
 * This exists so the order composer can show a price before the player
 * commits (ORDER-03) without reimplementing the pricing rules client-side —
 * the UI must never carry a parallel cost model that can drift from the one
 * the room charges. It is the PlayerView-shaped counterpart to the
 * GameState-shaped accounting inside submitOrder.ts, and both read the same
 * `edgeCost` and the same card data.
 *
 * `from` is where the agent stands when the action resolves, which is not
 * necessarily where it started the round: movement is declared first, so an
 * action in slot 2 is priced from the node slot 1's move ends on. Callers
 * that are pricing a second slot pass the simulated position; `costOfOrder`
 * below does that threading for them.
 *
 * Returns 0 for an action with no Intel price (HOLD, a free street move, a
 * card whose cost is zero). Never throws: an action naming an edge that does
 * not exist is priced at 0 rather than treated as a programmer error, since
 * the only authority on legality is legalOrders and this function is a
 * display helper, not a gate.
 */
export function actionIntelCost(view: PlayerView, action: Action, from: NodeIdLike): number {
  const rs = view.ruleset;
  const self = view.self;

  switch (action.type) {
    case 'HOLD':
      return 0;

    case 'MOVE':
      return edgeCost(view.map, from, action.to, self, rs)?.intel ?? 0;

    case 'SPRINT': {
      const first = edgeCost(view.map, from, action.via, self, rs)?.intel ?? 0;
      const second = edgeCost(view.map, action.via, action.to, self, rs)?.intel ?? 0;
      // An AGENT card pays the sprint surcharge in place of Intel; the edge
      // tolls are still owed either way.
      const surcharge = action.cardId ? 0 : rs.sprintIntelCost;
      return first + second + surcharge;
    }

    case 'AMBUSH':
      return rs.ambushIntelCost;

    default: {
      const card = getCard(action.cardId);
      return isActive(card) ? card.intelCost : 0;
    }
  }
}

/** Structural alias so this module does not re-export a branded id type. */
type NodeIdLike = Parameters<typeof edgeCost>[1];

/**
 * The total Intel an agent's whole order costs, and where the agent ends up.
 *
 * Threads position through the action list the way the resolution pipeline
 * will, so a second-slot strike is priced from the node the first-slot move
 * lands on rather than from the start node.
 */
export function costOfOrder(
  view: PlayerView,
  agentId: AgentId,
  actions: readonly Action[],
): { intel: number; endsAt: NodeIdLike } {
  const agent = view.self.agents.find((a) => a.id === agentId);
  let pos: NodeIdLike = agent?.nodeId ?? view.map.nodes[0]!.id;
  let intel = 0;

  for (const action of actions) {
    intel += actionIntelCost(view, action, pos);
    if (action.type === 'MOVE') pos = action.to;
    if (action.type === 'SPRINT') pos = action.to;
  }

  return { intel, endsAt: pos };
}

/**
 * The Intel this player has left to spend on `agentId`, after every OTHER
 * agent's already-submitted order and after `prefix`, the actions already
 * chosen for this agent in the current draft.
 *
 * This is the client-side half of the cross-agent double-spend problem
 * (ORDER-05): two agents share one Intel pool and submit separately, so
 * without subtracting what the other agent already committed, both orders
 * look affordable and the second is refused by the room with no explanation
 * the player can act on. The server's own `viewForOrdering` performs the
 * identical subtraction from GameState; this performs it from what the
 * client legitimately knows — its own submitted orders.
 *
 * `submittedByOtherAgents` is the caller's record of orders it has already
 * sent and had acked this round. The view's Intel figure does not reflect
 * them: Intel is charged during resolution, not at submission.
 */
export function intelAvailableFor(
  view: PlayerView,
  agentId: AgentId,
  submittedByOtherAgents: ReadonlyMap<string, readonly Action[]>,
  prefix: readonly Action[] = [],
): number {
  let spent = 0;

  for (const [otherAgentId, actions] of submittedByOtherAgents) {
    if (otherAgentId === (agentId as string)) continue;
    const other = view.self.agents.find((a) => (a.id as string) === otherAgentId);
    if (!other) continue;
    spent += costOfOrder(view, other.id, actions).intel;
  }

  spent += costOfOrder(view, agentId, prefix).intel;

  return Math.max(0, view.self.intel - spent);
}

/**
 * The view to compose `agentId`'s order against — the client-side
 * counterpart of `viewForOrdering`, which does the same subtraction from
 * GameState inside the room.
 *
 * Without this, `legalOrders` prices every option against the player's full
 * Intel and happily offers a card the other agent's committed order has
 * already spent the Intel for. The player picks it, the room refuses it, and
 * nothing on screen ever explained why.
 *
 * Deliberately does NOT subtract `prefix`: `legalOrders` already replays the
 * prefix itself, so subtracting it here too would charge this agent's own
 * chosen actions twice. Returns `view` unchanged by reference when nothing
 * is committed, so the common single-agent case allocates nothing.
 */
export function viewForComposing(
  view: PlayerView,
  agentId: AgentId,
  submittedByOtherAgents: ReadonlyMap<string, readonly Action[]>,
): PlayerView {
  const available = intelAvailableFor(view, agentId, submittedByOtherAgents, []);
  if (available === view.self.intel) return view;
  return { ...view, self: { ...view.self, intel: available } };
}

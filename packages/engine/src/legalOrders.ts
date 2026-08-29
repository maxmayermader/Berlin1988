import type {
  Action,
  ActiveCard,
  AgentId,
  CardId,
  NodeId,
  PlayerView,
} from '@berlin/shared';
import { getCard, isActive } from './content/cards.js';
import { areAdjacent, neighbours, nodeOf, withinRange } from './graph.js';
import { edgeCost } from './costs.js';
import { isReady } from './cooldowns.js';
import { actionBudget, actionsUsed, maxFreeActions } from './actionBudget.js';

/**
 * Enumerate every action one agent could legally take right now.
 *
 * Takes a PlayerView and nothing else — the AI calls this with exactly what a
 * human's client has. Requiring GameState here would quietly hand bots extra
 * information, so the signature is load-bearing.
 *
 * `prefix` is the actions already chosen for this agent this round, so the
 * second slot accounts for Intel and cooldowns spent by the first.
 */
export function legalOrders(
  view: PlayerView,
  agent: AgentId,
  prefix: readonly Action[] = [],
): Action[] {
  const self = view.self;
  const a = self.agents.find((x) => x.id === agent);
  if (!a || !a.alive || self.eliminated) return [];
  if (view.phase !== 'ORDERS') return [];

  /**
   * Ambush costs Intel but no action, so the slot budget counts only the
   * actions that actually consume one. When the slots are gone an agent can
   * still lay a trap — and nothing else, which is why free actions are
   * enumerated separately below rather than filtered out at the end.
   */
  const slotsLeft = actionBudget(a, view.ruleset) - actionsUsed(prefix, view.ruleset);
  const freeLeft =
    maxFreeActions(view.ruleset) - prefix.filter((p) => p.type === 'AMBUSH').length;
  if (slotsLeft <= 0 && freeLeft <= 0) return [];

  const sim = simulatePrefix(view, a.nodeId, prefix);
  /**
   * Safehouses, ambushes, and decoys resolve BEFORE movement (pipeline steps
   * 1-3), so they are placed from where the agent starts the round, not where
   * it ends up. Using the start node here also makes them order-independent,
   * which is what lets submitOrder validate in canonical movement-first order.
   */
  const startPos = a.nodeId;
  const map = view.map;
  const rs = view.ruleset;
  const out: Action[] = [];

  const blocked = (n: NodeId) => view.activeBlockades[n as string] !== undefined;
  const intelLeft = self.intel - sim.intelSpent;
  const cardUsable = (id: CardId): boolean =>
    self.loadout.includes(id) && isReady(self, id) && !sim.cardsUsed.has(id as string);

  // --- Free actions -------------------------------------------------------
  // Available even when the agent has spent both slots.
  if (freeLeft > 0 && !view.ruleset.ambushCostsAction) {
    const trapped =
      self.traps.some((t) => t.nodeId === startPos) ||
      prefix.some((p) => p.type === 'AMBUSH');
    if (!trapped && view.ruleset.ambushIntelCost <= intelLeft) {
      for (const id of self.loadout) {
        const card = getCard(id);
        if (card.kind !== 'ACTIVE' || card.icon !== 'STRIKE') continue;
        if (!cardUsable(id)) continue;
        out.push({ type: 'AMBUSH', cardId: id });
      }
    }
  }

  if (slotsLeft <= 0) return out;

  out.push({ type: 'HOLD' });

  /**
   * Movement must be declared BEFORE operations.
   *
   * Strikes and bribes resolve from the post-movement node (pipeline steps 4
   * then 9), so a strike composed at the start node would silently go out of
   * range the moment a move is added after it. Rather than let the UI offer a
   * target it will then reject, movement is simply closed off once one of those
   * has been chosen — which is also the order the round actually resolves in.
   *
   * Only STRIKE and BRIBE are position-dependent. Safehouses, ambushes, and
   * decoys are placed from the start node and wiretaps can target anywhere, so
   * none of them constrain a later move.
   */
  const committedOperation = prefix.some(
    (p) => p.type === 'STRIKE' || p.type === 'BRIBE',
  );

  // --- Movement -----------------------------------------------------------
  for (const to of committedOperation ? [] : neighbours(map, sim.pos)) {
    if (blocked(to)) continue;
    const c = edgeCost(map, sim.pos, to, self, rs);
    if (!c || c.intel > intelLeft) continue;
    out.push({ type: 'MOVE', to });
  }

  if (!committedOperation && sim.sprints < rs.maxSprintsPerAgentPerRound) {
    for (const via of neighbours(map, sim.pos)) {
      if (blocked(via)) continue;
      const c1 = edgeCost(map, sim.pos, via, self, rs);
      if (!c1) continue;
      for (const to of neighbours(map, via)) {
        if (to === sim.pos || blocked(to)) continue;
        const c2 = edgeCost(map, via, to, self, rs);
        if (!c2) continue;
        const tolls = c1.intel + c2.intel;

        if (tolls + rs.sprintIntelCost <= intelLeft) {
          out.push({ type: 'SPRINT', via, to });
        }
        // AGENT cards pay the sprint surcharge instead of Intel.
        for (const id of agentCards(self.loadout)) {
          if (!cardUsable(id) || tolls > intelLeft) continue;
          out.push({ type: 'SPRINT', via, to, cardId: id });
        }
      }
    }
  }

  // --- Card plays ---------------------------------------------------------
  for (const id of self.loadout) {
    const card = getCard(id);
    if (!isActive(card) || !cardUsable(id)) continue;
    if (card.intelCost > intelLeft) continue;
    if (card.icon === 'AGENT') continue; // handled as sprints above

    switch (card.icon) {
      case 'WIRETAP':
        for (const n of map.nodes) {
          if (blocked(n.id)) continue;
          out.push({ type: 'WIRETAP', cardId: id, target: n.id });
        }
        break;

      case 'BRIBE': {
        const here = nodeOf(map, sim.pos);
        const runtime = view.visibleNodes[sim.pos as string];
        if (here.hasInformant && runtime && runtime.informantOwner !== self.id) {
          out.push({ type: 'BRIBE', cardId: id });
        }
        break;
      }

      case 'DECOY':
        if (self.decoys.length < rs.maxActiveDecoys) {
          for (const n of [startPos, ...withinRange(map, startPos, 2)]) {
            if (blocked(n)) continue;
            out.push({ type: 'DECOY', cardId: id, target: n });
          }
        }
        break;

      case 'SAFEHOUSE':
        if (self.safehouse !== startPos) {
          out.push({ type: 'SAFEHOUSE', cardId: id });
        }
        break;

      case 'STRIKE': {
        for (const target of [sim.pos, ...neighbours(map, sim.pos)]) {
          if (blocked(target)) continue;
          out.push({ type: 'STRIKE', cardId: id, target });
        }
        // When ambush costs an action it belongs here, competing for a slot
        // with striking. When it doesn't, it was already offered as a free
        // action above and must not be listed twice.
        const alreadyTrapped =
          self.traps.some((t) => t.nodeId === startPos) ||
          prefix.some((p) => p.type === 'AMBUSH');
        if (rs.ambushCostsAction && !alreadyTrapped && rs.ambushIntelCost <= intelLeft) {
          out.push({ type: 'AMBUSH', cardId: id });
        }
        break;
      }
    }
  }

  return out;
}

/** Whether one specific action is currently legal. Used by submitOrder. */
export function isLegal(
  view: PlayerView,
  agent: AgentId,
  action: Action,
  prefix: readonly Action[] = [],
): boolean {
  return legalOrders(view, agent, prefix).some((x) => sameAction(x, action));
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'HOLD':
      return true;
    case 'MOVE':
      return a.to === (b as typeof a).to;
    case 'SPRINT': {
      const o = b as typeof a;
      return a.via === o.via && a.to === o.to && (a.cardId ?? null) === (o.cardId ?? null);
    }
    case 'BRIBE':
    case 'SAFEHOUSE':
    case 'AMBUSH':
      return a.cardId === (b as typeof a).cardId;
    case 'WIRETAP':
    case 'DECOY':
    case 'STRIKE': {
      const o = b as typeof a;
      return a.cardId === o.cardId && a.target === o.target;
    }
  }
}

interface PrefixSim {
  pos: NodeId;
  intelSpent: number;
  sprints: number;
  cardsUsed: Set<string>;
}

/** Replay already-chosen actions to get the state the next slot sees. */
function simulatePrefix(
  view: PlayerView,
  start: NodeId,
  prefix: readonly Action[],
): PrefixSim {
  const sim: PrefixSim = { pos: start, intelSpent: 0, sprints: 0, cardsUsed: new Set() };
  const rs = view.ruleset;

  for (const act of prefix) {
    switch (act.type) {
      case 'HOLD':
        break;
      case 'MOVE': {
        const c = edgeCost(view.map, sim.pos, act.to, view.self, rs);
        sim.intelSpent += c?.intel ?? 0;
        sim.pos = act.to;
        break;
      }
      case 'SPRINT': {
        const c1 = edgeCost(view.map, sim.pos, act.via, view.self, rs);
        const c2 = edgeCost(view.map, act.via, act.to, view.self, rs);
        sim.intelSpent += (c1?.intel ?? 0) + (c2?.intel ?? 0);
        if (act.cardId) sim.cardsUsed.add(act.cardId as string);
        else sim.intelSpent += rs.sprintIntelCost;
        sim.sprints += 1;
        sim.pos = act.to;
        break;
      }
      case 'AMBUSH':
        sim.intelSpent += rs.ambushIntelCost;
        sim.cardsUsed.add(act.cardId as string);
        break;
      default: {
        const card = getCard(act.cardId);
        if (isActive(card)) sim.intelSpent += card.intelCost;
        sim.cardsUsed.add(act.cardId as string);
        break;
      }
    }
  }
  return sim;
}

function agentCards(loadout: readonly CardId[]): CardId[] {
  return loadout.filter((id) => {
    const c = getCard(id);
    return c.kind === 'ACTIVE' && c.icon === 'AGENT';
  });
}

/** Convenience for the AI and UI: is this node in strike range of the agent? */
export function inStrikeRange(
  view: PlayerView,
  from: NodeId,
  target: NodeId,
): boolean {
  return from === target || areAdjacent(view.map, from, target);
}

export type { ActiveCard };

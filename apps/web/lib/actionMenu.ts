import { actionIntelCost, cooldownRemaining, getCard, isActive, legalOrders } from '@berlin/engine';
import type { Action, AgentId, CardId, NodeId, PlayerView } from '@berlin/shared';

/**
 * The order composer's view model.
 *
 * `legalOrders()` returns a flat list of every legal Action — for a 16-node
 * map with a wiretap in hand that is well over a hundred entries, because
 * each (card, target) pair is its own Action. A flat list is unusable as a
 * menu, so this groups them into one option per operation and hands the
 * targets back as a set the board can highlight. Choosing an operation and
 * then a node is also what resolves ORDER-07: when a node is a legal target
 * for both Move and Strike, the operation is already known by the time the
 * node is clicked, so nothing has to guess.
 *
 * Every option here comes from `legalOrders()`. Nothing in this module
 * decides legality, cost, or cooldown — those are engine answers
 * (apps/web/CLAUDE.md rule 2). What it adds is grouping and labelling.
 */

export type ActionKind = Action['type'];

export interface ActionOption {
  /** Stable identity for React keys and for matching a pending selection. */
  readonly key: string;
  readonly kind: ActionKind;
  readonly cardId: CardId | null;
  /** "Strike", or "Strike · Scharfschütze" when a card names the play. */
  readonly label: string;
  /** The card's rules text, for ORDER-06. Empty for cardless actions. */
  readonly text: string;
  /** Intel price. For targeted actions whose price varies by target (Move,
   *  Sprint), this is the cheapest of them — `costForTarget` has the exact
   *  figure once a target is chosen. */
  readonly intelCost: number;
  /** True when the price differs between this option's targets. */
  readonly costVaries: boolean;
  /** Rounds until this card is playable again. 0 when ready. */
  readonly cooldown: number;
  /** True when the action consumes no action slot (Ambush). */
  readonly free: boolean;
  /** Legal targets, empty when the action takes none. */
  readonly targets: readonly NodeId[];
  /** The Action to assign directly, when this option needs no target. */
  readonly immediate: Action | null;
}

const KIND_LABELS: Record<ActionKind, string> = {
  HOLD: 'Hold',
  MOVE: 'Move',
  SPRINT: 'Sprint',
  WIRETAP: 'Wiretap',
  BRIBE: 'Bribe informant',
  DECOY: 'Decoy',
  SAFEHOUSE: 'Safehouse',
  STRIKE: 'Strike',
  AMBUSH: 'Ambush',
};

/** One-line explanation of what each operation does, for players who have
 *  not memorised the rules. Card text covers the specifics; this covers the
 *  verb itself. */
const KIND_HINTS: Record<ActionKind, string> = {
  HOLD: 'Stay put and bank the action. +1 Intel.',
  MOVE: 'Walk to an adjacent node.',
  SPRINT: 'Two steps in one action.',
  WIRETAP: 'Learn whether anyone is at a node.',
  BRIBE: 'Take this node’s informant for its Intel income.',
  DECOY: 'Plant a false signal to draw attention.',
  SAFEHOUSE: 'Claim this node. Wins every contest here, and never moves.',
  STRIKE: 'Kill anyone at the target. Loud — neighbours learn where you are.',
  AMBUSH: 'Set a silent trap here. Costs no action.',
};

/** The node a target-taking action points at, or null. */
function targetOf(action: Action): NodeId | null {
  switch (action.type) {
    case 'MOVE':
      return action.to;
    case 'SPRINT':
      return action.to;
    case 'WIRETAP':
    case 'DECOY':
    case 'STRIKE':
      return action.target;
    default:
      return null;
  }
}

function cardIdOf(action: Action): CardId | null {
  return 'cardId' in action && action.cardId !== undefined ? action.cardId : null;
}

function optionKey(kind: ActionKind, cardId: CardId | null): string {
  return `${kind}:${cardId ?? ''}`;
}

/**
 * Groups `legalOrders(view, agentId, prefix)` into one option per operation.
 *
 * `from` is where the agent stands for this slot — the start node for slot
 * 1, or wherever slot 1's movement ends for slot 2 — and is used only to
 * price the options.
 */
export function actionOptions(
  view: PlayerView,
  agentId: AgentId,
  prefix: readonly Action[] = [],
): ActionOption[] {
  const legal = legalOrders(view, agentId, prefix);
  if (legal.length === 0) return [];

  const from = positionAfter(view, agentId, prefix);

  const groups = new Map<
    string,
    { kind: ActionKind; cardId: CardId | null; actions: Action[]; costs: number[] }
  >();

  for (const action of legal) {
    const cardId = cardIdOf(action);
    const key = optionKey(action.type, cardId);
    let group = groups.get(key);
    if (!group) {
      group = { kind: action.type, cardId, actions: [], costs: [] };
      groups.set(key, group);
    }
    group.actions.push(action);
    group.costs.push(actionIntelCost(view, action, from));
  }

  const out: ActionOption[] = [];
  for (const [key, group] of groups) {
    const card = group.cardId ? getCard(group.cardId) : null;
    const activeCard = card && isActive(card) ? card : null;
    const targets = group.actions.map(targetOf).filter((n): n is NodeId => n !== null);
    const minCost = Math.min(...group.costs);

    out.push({
      key,
      kind: group.kind,
      cardId: group.cardId,
      label: activeCard ? `${KIND_LABELS[group.kind]} · ${activeCard.name}` : KIND_LABELS[group.kind],
      text: activeCard?.text ?? KIND_HINTS[group.kind],
      intelCost: minCost,
      costVaries: new Set(group.costs).size > 1,
      cooldown: 0, // every option here is legal, so its card is ready by definition
      free: group.kind === 'AMBUSH' && !view.ruleset.ambushCostsAction,
      // Targets are de-duplicated: a Sprint can reach one node by more than
      // one route, and the board should offer that node once.
      targets: [...new Set(targets)],
      immediate: targets.length === 0 ? group.actions[0]! : null,
    });
  }

  return out.sort(byMenuOrder);
}

/** Menu order: movement first (it must be declared first anyway), then
 *  operations, with Hold last as the always-available fallback. */
const KIND_ORDER: ActionKind[] = [
  'MOVE',
  'SPRINT',
  'STRIKE',
  'AMBUSH',
  'WIRETAP',
  'BRIBE',
  'DECOY',
  'SAFEHOUSE',
  'HOLD',
];

function byMenuOrder(a: ActionOption, b: ActionOption): number {
  const rank = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  return rank !== 0 ? rank : a.label.localeCompare(b.label);
}

/** The exact Action for one option and one chosen node. */
export function actionForTarget(
  view: PlayerView,
  agentId: AgentId,
  option: ActionOption,
  target: NodeId,
  prefix: readonly Action[] = [],
): Action | null {
  const legal = legalOrders(view, agentId, prefix);
  return (
    legal.find(
      (action) =>
        action.type === option.kind &&
        cardIdOf(action) === option.cardId &&
        targetOf(action) === target,
    ) ?? null
  );
}

/** The exact Intel price of one option against one target. */
export function costForTarget(
  view: PlayerView,
  agentId: AgentId,
  option: ActionOption,
  target: NodeId,
  prefix: readonly Action[] = [],
): number | null {
  const action = actionForTarget(view, agentId, option, target, prefix);
  if (!action) return null;
  return actionIntelCost(view, action, positionAfter(view, agentId, prefix));
}

/** Where the agent stands once `prefix` has resolved. */
export function positionAfter(
  view: PlayerView,
  agentId: AgentId,
  prefix: readonly Action[],
): NodeId {
  const agent = view.self.agents.find((a) => a.id === agentId);
  let pos = agent?.nodeId ?? view.map.nodes[0]!.id;
  for (const action of prefix) {
    if (action.type === 'MOVE' || action.type === 'SPRINT') pos = action.to;
  }
  return pos;
}

/**
 * Operations the player holds a card for but cannot play right now, with the
 * reason (ORDER-04).
 *
 * Derived by diffing the player's own loadout against what `legalOrders`
 * offered: a card in hand with no corresponding option is unavailable, and
 * the reason is whichever gate it fails. Cooldown and Intel are checked in
 * that order because a card on cooldown is unplayable at any price, so
 * naming Intel first would be misleading.
 */
export interface UnavailableOption {
  readonly cardId: CardId;
  readonly label: string;
  readonly reason: string;
}

export function unavailableOptions(
  view: PlayerView,
  agentId: AgentId,
  intelAvailable: number,
  prefix: readonly Action[] = [],
): UnavailableOption[] {
  const offered = new Set(actionOptions(view, agentId, prefix).map((o) => o.cardId));
  const out: UnavailableOption[] = [];

  for (const cardId of view.self.loadout) {
    if (offered.has(cardId)) continue;
    const card = getCard(cardId);
    if (!isActive(card)) continue; // passives are never played

    const remaining = cooldownRemaining(view.self, cardId);
    const reason =
      remaining > 0
        ? `On cooldown for ${remaining} more round${remaining === 1 ? '' : 's'}`
        : card.intelCost > intelAvailable
          ? `Costs ${card.intelCost} Intel — you have ${intelAvailable}`
          : prefix.length > 0
            ? 'No legal target from here this round'
            : 'No legal target right now';

    out.push({ cardId, label: `${KIND_LABELS[card.icon as ActionKind] ?? card.icon} · ${card.name}`, reason });
  }

  return out;
}

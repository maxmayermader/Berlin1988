import type { Action, AgentState, NodeId, PlayerView } from '@berlin/shared';
import { areAdjacent, distance, getCard, nodeOf } from '@berlin/engine';
import { pAnyAt, totalEntropy, type Belief } from './belief.js';
import { safehouseRisk, trapRisk, type ThreatMap } from './threatMap.js';

/**
 * Feature extractors. Each returns a roughly 0..1 signal so personality weights
 * are comparable across features.
 *
 * These run over every legal action, every round, at every planning step —
 * keep them cheap and independent.
 */
export interface Features {
  killProbability: number;
  trapValue: number;
  exposureCost: number;
  informationGain: number;
  economyDelta: number;
  objectiveProgress: number;
  survivalRisk: number;
  blockadeRisk: number;
  groundAdvantage: number;
  tempoValue: number;
  /** Getting between a rival and the win. Basic competence, not a personality. */
  denialValue: number;
}

export const FEATURE_KEYS = [
  'killProbability',
  'trapValue',
  'exposureCost',
  'informationGain',
  'economyDelta',
  'objectiveProgress',
  'survivalRisk',
  'blockadeRisk',
  'groundAdvantage',
  'tempoValue',
  'denialValue',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureContext {
  readonly view: PlayerView;
  readonly belief: Belief;
  readonly threat: ThreatMap;
  readonly agent: AgentState;
  /** Where this action leaves the agent, if it moves it. */
  readonly destination: NodeId;
  /** Nodes this player's other agents are heading for, for joint planning. */
  readonly claimedByTeammates: ReadonlySet<string>;
  /**
   * Dossiers each rival is believed to be carrying, counted from the PUBLIC
   * "dossier taken" announcements. Inference from the shared log, not a peek.
   */
  readonly carriedByRival: ReadonlyMap<string, number>;
}

const zero = (): Features => ({
  killProbability: 0,
  trapValue: 0,
  exposureCost: 0,
  informationGain: 0,
  economyDelta: 0,
  objectiveProgress: 0,
  survivalRisk: 0,
  blockadeRisk: 0,
  groundAdvantage: 0,
  tempoValue: 0,
  denialValue: 0,
});

export function extract(action: Action, ctx: FeatureContext): Features {
  const f = zero();
  const { view, belief, threat, agent } = ctx;
  const dest = ctx.destination;
  const destKey = dest as string;
  const rs = view.ruleset;
  const roundsLeft = Math.max(1, view.settings.roundLimit - view.round + 1);

  // --- Universal position terms ------------------------------------------

  f.survivalRisk = trapRisk(threat, destKey) + rivalStrikeExposure(ctx, dest) * 0.5;
  f.blockadeRisk = blockadeRiskAt(view, dest);
  f.groundAdvantage =
    (view.self.safehouse === dest ? 1 : 0) - safehouseRisk(threat, destKey) * 0.8;
  f.objectiveProgress = objectiveProgress(ctx, dest);
  f.denialValue = denialValue(ctx, dest);

  // Spread out: two agents converging on one belief peak leaves half the map
  // unwatched, so a node a teammate already claims is worth much less.
  if (ctx.claimedByTeammates.has(destKey)) f.objectiveProgress *= 0.4;

  // --- Action-specific terms ---------------------------------------------

  switch (action.type) {
    case 'HOLD':
      f.economyDelta = rs.intelPerHeldAction / 4;
      f.exposureCost = 0;
      f.tempoValue = -0.2;
      break;

    case 'MOVE':
    case 'SPRINT': {
      const cost = action.type === 'SPRINT' && !action.cardId ? rs.sprintIntelCost : 0;
      f.economyDelta = -cost / 6;
      f.exposureCost = crossesCheckpoint(ctx, dest) ? 0.5 : 0.05;
      f.tempoValue = 0.1;
      break;
    }

    case 'STRIKE': {
      const card = getCard(action.cardId);
      const target = action.target as string;
      f.killProbability = pAnyAt(belief, target);
      // A strike ALWAYS reveals the striker. That is the price, and the
      // personality weight on exposureCost is what separates Marek from Vogel.
      f.exposureCost = view.self.silencers > 0 ? 0.35 : 1;
      f.economyDelta = -(card.kind === 'ACTIVE' ? card.intelCost : 0) / 6;
      f.survivalRisk += 0.25; // you end up standing where you just shot
      f.tempoValue = 0.5;
      break;
    }

    case 'AMBUSH': {
      // Costs no action, so this is close to free tempo — its value is entirely
      // "how likely is someone to walk here in the next few rounds".
      f.trapValue = trapValueAt(ctx, agent.nodeId);
      f.economyDelta = -rs.ambushIntelCost / 6;
      f.exposureCost = 0; // setting a trap makes no noise at all
      f.tempoValue = 0.3;
      break;
    }

    case 'WIRETAP': {
      const card = getCard(action.cardId);
      f.informationGain = scanValue(ctx, action.target);
      f.economyDelta = -(card.kind === 'ACTIVE' ? card.intelCost : 0) / 6;
      f.exposureCost = 0;
      f.tempoValue = 0.2;
      break;
    }

    case 'BRIBE': {
      const card = getCard(action.cardId);
      // An informant pays Intel every round AND reports arrivals, so its value
      // scales with how much match is left.
      f.economyDelta =
        (rs.intelPerInformant * roundsLeft) / 20 -
        (card.kind === 'ACTIVE' ? card.intelCost : 0) / 6;
      f.informationGain = 0.3;
      f.exposureCost = 0.1;
      break;
    }

    case 'SAFEHOUSE': {
      const card = getCard(action.cardId);
      // Worth most on ground you expect to fight over — it wins contested
      // nodes outright, and it is your blockade shelter and escape point.
      f.groundAdvantage += 0.6 + pAnyAt(belief, agent.nodeId as string) * 0.5;
      f.economyDelta = -(card.kind === 'ACTIVE' ? card.intelCost : 0) / 6;
      f.exposureCost = 0;
      break;
    }

    case 'DECOY': {
      const card = getCard(action.cardId);
      f.informationGain = 0.15;
      f.exposureCost = 0;
      f.economyDelta = -(card.kind === 'ACTIVE' ? card.intelCost : 0) / 6;
      // A decoy is worth most where someone is likely to scan or shoot.
      f.survivalRisk -= pAnyAt(belief, action.target as string) * 0.4;
      break;
    }
  }

  // Late in the match, unspent resources are wasted resources.
  f.tempoValue += (1 - roundsLeft / view.settings.roundLimit) * 0.4;

  return f;
}

/**
 * How valuable is it to be HERE, given someone is close to winning?
 *
 * The extraction route is public information: dossier pickups are announced by
 * node, and every faction's extraction point is on the map. A player who has
 * seen three "dossier taken" calls against one rival knows roughly where that
 * rival has to walk. Bots that ignore this lose to anyone who just runs
 * objectives, which is exactly what the first sim sweep showed.
 */
function denialValue(ctx: FeatureContext, dest: NodeId): number {
  const { view } = ctx;
  const need = view.ruleset.dossiersToExtract;
  let best = 0;

  for (const opp of view.opponents) {
    if (opp.eliminated) continue;
    const carried = ctx.carriedByRival.get(opp.id as string) ?? 0;
    if (carried <= 0) continue;

    const exit = view.map.nodes.find((n) => n.extractionFor === opp.faction);
    if (!exit) continue;

    // Urgency ramps as they approach a full set.
    const urgency = Math.min(1, carried / need);
    const d = distance(view.map, dest, exit.id);
    best = Math.max(best, (urgency * urgency) / (1 + d));
  }

  return best;
}

/** How exposed is `dest` to a rival strike, given where rivals probably are? */
function rivalStrikeExposure(ctx: FeatureContext, dest: NodeId): number {
  const { view, belief } = ctx;
  let risk = pAnyAt(belief, dest as string);
  for (const n of nodeOf(view.map, dest).edges) {
    risk += pAnyAt(belief, n.to as string) * 0.6;
  }
  return Math.min(1, risk);
}

function blockadeRiskAt(view: PlayerView, dest: NodeId): number {
  // Kontrolle Schedule turns this from a guess into a hard fact — the one place
  // a bot legitimately knows the future, because a human with the card does too.
  if (view.self.knownBlockades.length > 0) {
    return view.self.knownBlockades.some(
      (b) => b.nodeId === dest && b.round <= view.round + 1,
    )
      ? 1
      : 0;
  }
  if (view.announcedBlockades.some((b) => b.nodeId === dest)) return 1;
  if (view.round + 1 < view.ruleset.blockadeStartRound) return 0;
  return view.ruleset.blockadeChancePerRound / view.map.nodes.length;
}

function objectiveProgress(ctx: FeatureContext, dest: NodeId): number {
  const { view, agent } = ctx;
  const carried = agent.dossiers;
  const need = view.ruleset.dossiersToExtract;

  if (carried >= need) {
    const exit = view.map.nodes.find((n) => n.extractionFor === view.self.faction);
    if (!exit) return 0;
    const d = distance(view.map, dest, exit.id);
    return 1 / (1 + d);
  }

  let best = 0;
  for (const [key, runtime] of Object.entries(view.visibleNodes)) {
    if (runtime.dossiers <= 0) continue;
    const d = distance(view.map, dest, key as NodeId);
    best = Math.max(best, 1 / (1 + d));
  }
  // Dossier pickups are announced publicly, so recent ones are known even when
  // the node isn't visible.
  for (const sig of view.signals) {
    if (sig.kind !== 'DOSSIER_TAKEN' || !sig.nodeId) continue;
    best = Math.max(best, 0.3 / (1 + distance(view.map, dest, sig.nodeId)));
  }
  return best;
}

/** Traffic estimate: junctions and dossier approaches are where people walk. */
function trapValueAt(ctx: FeatureContext, node: NodeId): number {
  const { view, belief } = ctx;
  const n = nodeOf(view.map, node);
  const degree = n.edges.length / 5;

  // Someone believed to be one hop away is a plausible visitor next round.
  let approach = 0;
  for (const e of n.edges) approach += pAnyAt(belief, e.to as string);

  const dossierNearby = Object.entries(view.visibleNodes).some(
    ([k, r]) => r.dossiers > 0 && distance(view.map, node, k as NodeId) <= 1,
  );

  return Math.min(1, degree * 0.4 + approach * 0.6 + (dossierNearby ? 0.3 : 0));
}

/**
 * Value of scanning a node.
 *
 * Naive entropy reduction badly OVER-values this, and the first sim sweep
 * showed exactly what that looks like: every personality spent 30-43% of its
 * actions wiretapping and almost none of them ever fired a shot. Two
 * corrections, both real properties of the game rather than tuning knobs:
 *
 *  1. INFORMATION DECAYS BEFORE YOU CAN USE IT. Scans resolve at pipeline step
 *     8, after that round's movement, and orders for the next round are
 *     committed before it. So a scan tells you where someone WAS one move ago;
 *     by the time you can act, they have diffused across ~3 neighbours. Most of
 *     what you paid for is gone.
 *
 *  2. INFORMATION IS ONLY WORTH WHAT YOU CAN DO WITH IT. Katja never strikes,
 *     so knowing exactly where someone is buys her nothing but avoidance — and
 *     she was still spending a third of her actions on scans.
 */
function scanValue(ctx: FeatureContext, target: NodeId): number {
  const p = pAnyAt(ctx.belief, target as string);
  const h = p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
  const spread = totalEntropy(ctx.belief) / 8;
  const raw = Math.min(1, h * (0.5 + spread));

  return raw * INFORMATION_RETENTION * exploitability(ctx);
}

/**
 * Roughly how much of a scan survives one round of diffusion. With average
 * degree ~3 and a 25% stay probability, a pinned position spreads over about
 * four nodes before you get to use it.
 */
const INFORMATION_RETENTION = 0.35;

/** Can this player actually convert a sighting into a kill right now? */
function exploitability(ctx: FeatureContext): number {
  const { view } = ctx;
  const armed = view.self.loadout.some((id) => {
    const c = getCard(id);
    if (c.kind !== 'ACTIVE' || c.icon !== 'STRIKE') return false;
    return (view.self.cooldowns[id as string] ?? 0) <= 0;
  });
  const affordable = view.self.intel >= view.ruleset.ambushIntelCost;
  // A floor of 0.25: knowing where someone is always has some avoidance value.
  return 0.25 + (armed && affordable ? 0.75 : 0);
}

function crossesCheckpoint(ctx: FeatureContext, dest: NodeId): boolean {
  const from = ctx.agent.nodeId;
  if (!areAdjacent(ctx.view.map, from, dest)) return false;
  return nodeOf(ctx.view.map, from).edges.some(
    (e) => e.to === dest && e.type === 'CHECKPOINT',
  );
}

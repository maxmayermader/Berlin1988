import type {
  Action,
  AgentId,
  AgentOrder,
  CardId,
  Difficulty,
  MatchSettings,
  NodeId,
  PersonalityId,
  PlayerView,
  RngState,
} from '@berlin/shared';
import {
  actionBudget,
  actionsUsed,
  legalOrders,
  maxFreeActions,
  seedRng,
  validateLoadout,
  DEFAULT_RULESET,
  ALL_CARDS,
} from '@berlin/engine';
import { cloneBelief, createBelief, forget, predict, type Belief } from './belief.js';
import { tunnelBiasFrom, updateBelief } from './evidence.js';
import { createThreatMap, confirmTrap, safehouseRisk, type ThreatMap, updateThreatMap } from './threatMap.js';
import { extract, type FeatureContext } from './features.js';
import { choose, score, type Scored } from './select.js';
import { PERSONALITIES, type Personality } from './personalities/index.js';
import { enforcesSelfPreservation, TIERS, type DifficultyTier } from './difficulty.js';

/**
 * An AI opponent.
 *
 * `decide` takes a PlayerView and an agent id — NOTHING ELSE. A bot sees
 * exactly what a human in that seat sees. Passing a GameState is a type error,
 * and tests/fairness.test.ts asserts it. Difficulty degrades the bot's
 * inference, never its information.
 *
 * No LLM in the decision loop: decisions must be deterministic under a seed,
 * instant, free, and offline-capable.
 */
export interface AIAgent {
  readonly personality: PersonalityId;
  readonly difficulty: Difficulty;
  decide(view: PlayerView, agentId: AgentId): Action[];
  decideOrder(view: PlayerView, agentId: AgentId): AgentOrder;
  buildLoadout(settings: MatchSettings): CardId[];
}

export function createAgent(
  personality: PersonalityId,
  difficulty: Difficulty,
  seed: string,
): AIAgent {
  return new Bot(PERSONALITIES[personality], TIERS[difficulty], seed);
}

class Bot implements AIAgent {
  readonly personality: PersonalityId;
  readonly difficulty: Difficulty;

  private readonly rng: RngState;
  private readonly threat: ThreatMap = createThreatMap();
  private belief: Belief | null = null;
  /**
   * The belief advanced ONE step further — where rivals will be after this
   * round's movement, not where they were at the end of last round.
   *
   * This is the whole game in one variable. Movement resolves at step 4 and
   * strikes and scans at steps 8-9, so aiming at the posterior means aiming at
   * where they *were*. "Shoot where they're going, not where they are" is the
   * documented skill ceiling (GAME_DESIGN §7.2) and a bot that doesn't do it
   * essentially never lands a hit — the first sim sweep measured 0.05 burns per
   * match before this existed.
   */
  private predicted: Belief | null = null;
  private lastRoundSeen = -1;
  /** Nodes this player's other agents are already heading for, this round. */
  private claimed = new Set<string>();
  /**
   * Dossiers each rival is believed to be holding, counted from the PUBLIC
   * pickup announcements and cleared when they extract or lose an agent.
   * Public log arithmetic, not a peek at hidden state.
   */
  private readonly carried = new Map<string, number>();

  constructor(
    private readonly p: Personality,
    private readonly tier: DifficultyTier,
    seed: string,
  ) {
    this.personality = p.id;
    this.difficulty = tier.id;
    this.rng = seedRng(`${seed}:${p.id}:${tier.id}`);
  }

  buildLoadout(settings: MatchSettings): CardId[] {
    const rs = DEFAULT_RULESET;
    // Take the personality's preferred list, then repair it if content drift
    // has made it illegal — a bot must never sit down with an invalid deck.
    let deck = this.p.loadout.slice(0, rs.loadoutSize) as CardId[];
    if (validateLoadout(deck, rs).length === 0) return deck;

    const pool = ALL_CARDS.map((c) => c.id).filter((id) => !deck.includes(id));
    for (const filler of pool) {
      if (validateLoadout(deck, rs).length === 0) break;
      deck = [...deck.slice(0, rs.loadoutSize - 1), filler];
    }
    void settings;
    return deck;
  }

  decideOrder(view: PlayerView, agentId: AgentId): AgentOrder {
    return { agentId, actions: this.decide(view, agentId) };
  }

  decide(view: PlayerView, agentId: AgentId): Action[] {
    this.sync(view);

    const agent = view.self.agents.find((a) => a.id === agentId);
    if (!agent || !agent.alive) return [];

    const rs = view.ruleset;
    const cap = actionBudget(agent, rs) + maxFreeActions(rs);
    const chosen: Action[] = [];

    for (let i = 0; i < cap; i++) {
      const options = legalOrders(view, agentId, chosen);
      if (options.length === 0) break;

      const scored = this.scoreAll(options, view, agent, chosen);
      if (scored.length === 0) break;

      const pick = choose(scored, this.tier, this.rng);
      if (!pick) break;
      chosen.push(pick);
    }

    // Claim the destination so this player's other agent spreads out instead of
    // chasing the same belief peak. Without this, two agents converge and leave
    // half the map unwatched.
    if (this.tier.jointPlanning) {
      this.claimed.add(this.destinationOf(chosen, agent.nodeId) as string);
    }

    return chosen;
  }

  /** Refresh belief and threat map once per round, not once per agent. */
  private sync(view: PlayerView): void {
    if (view.round === this.lastRoundSeen) return;
    this.lastRoundSeen = view.round;
    this.claimed = new Set();

    if (!this.belief) {
      this.belief = createBelief(view, this.tier.beliefFloor);
    }
    for (const opp of view.opponents) {
      if (opp.eliminated) forget(this.belief, opp.id);
    }

    const bias = this.tier.habitModelling ? tunnelBiasFrom(view) : new Map<string, number>();

    updateBelief(this.belief, view, bias, { beliefNoise: this.tier.beliefNoise }, this.rng);

    // Now look one move ahead. Everything that resolves after movement — every
    // strike, every scan, every trap placement — is evaluated against this.
    this.predicted = cloneBelief(this.belief);
    predict(this.predicted, view.map, bias);

    this.trackCarriedDossiers(view);
    updateThreatMap(this.threat, view);
    // A trap that actually fired is knowledge, not inference.
    for (const ev of view.lastRound) {
      if (ev.type === 'AMBUSH_TRIGGERED') confirmTrap(this.threat, ev.nodeId as string);
    }
  }

  /**
   * Dossier pickups, extractions, and burns are all public events, so every
   * player can keep this count. A rival at two of three dossiers is a rival
   * whose route home is worth standing on.
   */
  private trackCarriedDossiers(view: PlayerView): void {
    for (const sig of view.signals) {
      if (sig.kind !== 'DOSSIER_TAKEN' || !sig.playerId) continue;
      if (sig.playerId === view.self.id) continue;
      const key = sig.playerId as string;
      this.carried.set(key, (this.carried.get(key) ?? 0) + 1);
    }
    for (const ev of view.lastRound) {
      if (ev.type === 'EXTRACTION') this.carried.set(ev.playerId as string, 0);
      if (ev.type === 'AGENT_BURNED' && ev.dossiersDropped > 0) {
        const key = ev.playerId as string;
        const now = (this.carried.get(key) ?? 0) - ev.dossiersDropped;
        this.carried.set(key, Math.max(0, now));
      }
    }
    for (const opp of view.opponents) {
      if (opp.eliminated) this.carried.set(opp.id as string, 0);
    }
  }

  private scoreAll(
    options: readonly Action[],
    view: PlayerView,
    agent: PlayerView['self']['agents'][number],
    prefix: readonly Action[],
  ): Scored[] {
    const belief = this.predicted ?? this.belief!;
    const ruleCtx = { view, belief, threat: this.threat };
    const out: Scored[] = [];

    for (const action of options) {
      if (!this.p.allows(action, ruleCtx)) continue;
      if (this.suicidal(action, view, agent)) continue;

      const destination = this.destinationOf([...prefix, action], agent.nodeId);
      const ctx: FeatureContext = {
        view,
        belief,
        threat: this.threat,
        agent,
        destination,
        claimedByTeammates: this.claimed,
        carriedByRival: this.carried,
      };
      const features = extract(action, ctx);
      out.push({ action, score: score(features, this.p.weights), features });
    }

    // Every option was filtered out. Fall back to HOLD — and ONLY to HOLD.
    // Falling back to options[0] would quietly break the personality's own
    // rules: with both slots spent the only legal action left is AMBUSH, so
    // Katja, who is defined by never trapping, would trap about 1% of the time.
    // Doing nothing is always consistent with a personality; doing the one
    // thing it forbids is not.
    if (out.length === 0) {
      const hold = options.find((a) => a.type === 'HOLD');
      if (!hold) return [];
      const destination = this.destinationOf([...prefix, hold], agent.nodeId);
      const features = extract(hold, {
        view,
        belief,
        threat: this.threat,
        agent,
        destination,
        claimedByTeammates: this.claimed,
        carriedByRival: this.carried,
      });
      out.push({ action: hold, score: 0, features });
    }

    return out;
  }

  /**
   * The self-preservation floor (docs/AI_OPPONENTS.md §5.6). Not a personality
   * trait — a bot that does these things is broken, not weak, because agents
   * never respawn and the mistake ends its match.
   */
  private suicidal(
    action: Action,
    view: PlayerView,
    agent: PlayerView['self']['agents'][number],
  ): boolean {
    if (!enforcesSelfPreservation(this.tier)) return false;

    const dest = this.destinationOf([action], agent.nodeId);

    // Never walk into an announced blockade, or one Kontrolle Schedule shows.
    if (view.announcedBlockades.some((b) => b.nodeId === dest)) return true;
    if (
      view.self.knownBlockades.some((b) => b.nodeId === dest && b.round <= view.round)
    ) {
      return true;
    }

    // Never start a fight on ground a rival safehouse probably sits on —
    // contested nodes are won outright there, so that fight is auto-lost.
    if (action.type === 'STRIKE' && safehouseRisk(this.threat, action.target as string) > 0.6) {
      return true;
    }

    return false;
  }

  /** Where a list of actions leaves the agent. */
  private destinationOf(actions: readonly Action[], start: NodeId): NodeId {
    let pos = start;
    for (const a of actions) {
      if (a.type === 'MOVE') pos = a.to;
      else if (a.type === 'SPRINT') pos = a.to;
      else if (a.type === 'STRIKE') pos = a.target; // striker advances in
    }
    return pos;
  }
}

export { actionsUsed };

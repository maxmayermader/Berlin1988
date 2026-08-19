import type { Action, PersonalityId, PlayerView } from '@berlin/shared';
import type { FeatureKey } from '../features.js';
import type { Belief } from '../belief.js';
import { pAnyAt } from '../belief.js';
import { safehouseRisk, type ThreatMap } from '../threatMap.js';

/**
 * The five opponents.
 *
 * A personality is a weight vector plus a small number of hard behavioural
 * rules. The personality IS the AI, not a costume over a shared one — and
 * every one of them must have a documented, EXPLOITABLE tell. If a player
 * can't learn to beat it by reading its habits, it isn't a personality, it's a
 * difficulty slider. `sim/validate.ts` gates this.
 *
 * Hard rules are deliberately few and legible. "Never strikes below 65%
 * confidence" is a good rule; a twelve-branch decision tree is not — it is
 * unreadable to players, which defeats the entire purpose.
 */

export type Weights = Record<FeatureKey, number>;

export interface RuleContext {
  readonly view: PlayerView;
  readonly belief: Belief;
  readonly threat: ThreatMap;
}

export interface Personality {
  readonly id: PersonalityId;
  readonly name: string;
  readonly title: string;
  readonly quote: string;
  /** The exploitable habit. Must be demonstrable — see sim/validate.ts. */
  readonly tell: string;
  readonly weights: Weights;
  /** Card ids this personality builds its loadout from, in preference order. */
  readonly loadout: readonly string[];
  /** Return false to remove an action from consideration entirely. */
  allows(action: Action, ctx: RuleContext): boolean;
}

const w = (partial: Partial<Weights>): Weights => ({
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
  ...partial,
});

/** Confidence that a strike on this node lands. */
const confidence = (ctx: RuleContext, action: Action): number =>
  action.type === 'STRIKE' ? pAnyAt(ctx.belief, action.target as string) : 0;

// ---------------------------------------------------------------------------

/** 🎖️ "Everything is in the file. You simply haven't read far enough." */
export const VOGEL: Personality = {
  id: 'VOGEL',
  name: 'Oberst Klaus Vogel',
  title: 'The Bureaucrat',
  quote: 'Everything is in the file. You simply haven’t read far enough.',
  tell: 'He never sprints and never rushes. You always have one more round than you think — and the sweep is a pattern, so dead ends stay safe for two rounds at a time.',
  weights: w({
    informationGain: 3.4,
    economyDelta: 2.4,
    killProbability: 1.4,
    exposureCost: -1.2,
    survivalRisk: -1.4,
    blockadeRisk: -2.2,
    objectiveProgress: 0.6,
    groundAdvantage: 0.5,
    trapValue: 0.2,
    tempoValue: 0.2,
    denialValue: 2.0,
  }),
  loadout: [
    'wt_red', 'wt_blue', 'wt_gold',
    'br_red', 'br_gold', 'ps_bagman',
    'sh_red', 'ps_kontrolle',
    'st_red',
    'ag_red',
  ],
  allows(action, ctx) {
    // Methodical: never fires on thin evidence.
    if (action.type === 'STRIKE' && confidence(ctx, action) < 0.65) return false;
    // And never hurries. A man with a file does not run — which means you
    // always have one more round of margin against Vogel than against anyone
    // else, and that is the tell.
    if (action.type === 'SPRINT') return false;
    return true;
  },
};

/** 👻 "I was never there. Check your own records." */
export const KATJA: Personality = {
  id: 'KATJA',
  name: 'Katja Reiner',
  title: 'The Ghost',
  quote: 'I was never there. Check your own records.',
  tell: 'She never fights, so the ground between you is safe — and she always heads for the nearest dossier.',
  weights: w({
    objectiveProgress: 3.2,
    survivalRisk: -2.6,
    blockadeRisk: -2.4,
    informationGain: 0.8,
    economyDelta: 0.6,
    exposureCost: -1.8,
    tempoValue: 0.6,
    groundAdvantage: 0.3,
    denialValue: 0.6,
  }),
  loadout: [
    'dc_green', 'dc_blue', 'ps_ghost',
    'ps_dead_drop', 'ps_tunnel_rat', 'ag_green',
    'wt_green', 'wt_blue',
    'sh_green',
    'br_green',
  ],
  allows(action) {
    // Never strikes and never traps. She wins by not being there.
    return action.type !== 'STRIKE' && action.type !== 'AMBUSH';
  },
};

/** 🔪 "Subtlety is for people with time." */
export const MAREK: Personality = {
  id: 'MAREK',
  name: 'Marek Doležal',
  title: 'The Butcher',
  quote: 'Subtlety is for people with time.',
  tell: 'His Intel never accumulates. A Butcher at 2 Intel cannot strike — that is your window. He also walks into blockades.',
  weights: w({
    killProbability: 4.2,
    tempoValue: 1.6,
    exposureCost: -0.15,
    economyDelta: 0.2,
    survivalRisk: -0.5,
    blockadeRisk: -0.4,
    objectiveProgress: 0.8,
    informationGain: 1.0,
    trapValue: 0.3,
    denialValue: 2.6,
  }),
  loadout: [
    'st_red', 'st_blue', 'ps_k9',
    'wt_red', 'wt_blue', 'ps_sleeper',
    'dc_red',
    'sh_red',
    'ag_red',
    'br_red',
  ],
  allows(action, ctx) {
    // Fires on very thin evidence.
    if (action.type === 'STRIKE' && confidence(ctx, action) < 0.12) return false;
    // Never sits still while armed. Documented in AI_OPPONENTS §3 and worth
    // implementing rather than describing: it is why his Intel never
    // accumulates, which is the tell players actually read.
    if (action.type === 'HOLD' && armedAndFunded(ctx)) return false;
    return true;
  },
};

/** Holding a ready STRIKE card and the Intel to fire it. */
function armedAndFunded(ctx: RuleContext): boolean {
  const { self, ruleset } = ctx.view;
  return self.loadout.some((id) => {
    const cd = self.cooldowns[id as string] ?? 0;
    return cd <= 0 && (id as string).startsWith('st_') && self.intel >= ruleset.ambushIntelCost;
  });
}

/** 🕸️ "Come to me. I've been patient." */
export const HALLORAN: Personality = {
  id: 'HALLORAN',
  name: 'Director Halloran',
  title: 'The Spider',
  quote: 'Come to me. I’ve been patient.',
  tell: 'Territorial and static. His quarter of the map is a minefield; everywhere else is free.',
  weights: w({
    trapValue: 3.4,
    groundAdvantage: 2.4,
    economyDelta: 1.8,
    survivalRisk: -1.8,
    blockadeRisk: -1.8,
    killProbability: 0.9,
    exposureCost: -2.0,
    informationGain: 0.9,
    objectiveProgress: 0.4,
    denialValue: 1.4,
  }),
  loadout: [
    'st_red', 'st_green', 'ps_k9',
    'sh_red', 'sh_green',
    'br_red', 'ps_sleeper',
    'ps_cutout',
    'wt_red',
    'dc_red',
  ],
  allows(action, ctx) {
    // Almost always picks Mode B over Mode A. Same card, opposite temperament —
    // that split does more characterisation work than any weight tweak.
    if (action.type === 'STRIKE' && confidence(ctx, action) < 0.55) return false;
    // Home ground only: never strays far from the safehouse.
    if (action.type === 'MOVE' || action.type === 'SPRINT') {
      const home = ctx.view.self.safehouse;
      if (home) {
        const dest = action.type === 'MOVE' ? action.to : action.to;
        const d = hops(ctx.view, home, dest);
        if (d > 2) return false;
      }
    }
    return true;
  },
};

/** 🪞 "You've done this before. Twice, actually." */
export const SABLE: Personality = {
  id: 'SABLE',
  name: '"Sable"',
  title: 'The Mirror',
  quote: 'You’ve done this before. Twice, actually.',
  tell: 'It is reactive, which means it can be baited. Hold a pattern for four rounds, then break it.',
  weights: w({
    killProbability: 1.8,
    trapValue: 1.6,
    informationGain: 1.8,
    objectiveProgress: 1.6,
    economyDelta: 1.2,
    survivalRisk: -1.8,
    blockadeRisk: -2.0,
    groundAdvantage: 1.2,
    exposureCost: -1.0,
    tempoValue: 0.5,
    denialValue: 2.2,
  }),
  loadout: [
    'st_red', 'st_blue', 'ps_k9',
    'wt_blue', 'wt_red', 'ps_counter_surv',
    'sh_blue',
    'dc_blue',
    'ps_dead_drop',
    'ag_blue',
  ],
  allows(action, ctx) {
    if (action.type === 'STRIKE' && confidence(ctx, action) < 0.35) return false;
    // Reads the threat map harder than anyone: won't contest ground it
    // believes a rival safehouse sits on, because that fight is auto-lost.
    if (action.type === 'STRIKE' && safehouseRisk(ctx.threat, action.target as string) > 0.5) {
      return false;
    }
    return true;
  },
};

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  VOGEL,
  KATJA,
  MAREK,
  HALLORAN,
  SABLE,
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

function hops(view: PlayerView, a: string, b: string): number {
  // Cheap BFS, bounded — this is called per candidate move.
  if (a === b) return 0;
  const seen = new Set([a]);
  let frontier = [a];
  for (let d = 1; d <= 3; d++) {
    const next: string[] = [];
    for (const cur of frontier) {
      const node = view.map.nodes.find((n) => (n.id as string) === cur);
      for (const e of node?.edges ?? []) {
        const k = e.to as string;
        if (seen.has(k)) continue;
        if (k === b) return d;
        seen.add(k);
        next.push(k);
      }
    }
    frontier = next;
  }
  return 99;
}

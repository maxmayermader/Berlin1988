import type { CardId } from './ids.js';
import type { IconType, Sector } from './enums.js';

/**
 * Passive effects. Each is implemented by a named branch in the resolution
 * pipeline — this union is the contract between content data and rules code.
 */
export type PassiveEffect =
  | 'DEAD_DROP' // survive one ambush, relocate to safehouse or nearest U-Bahn
  | 'K9_UNIT' // +25% on a neutral contested roll
  | 'GHOST_PROTOCOL' // one strike that would burn you misses
  | 'TUNNEL_RAT' // survive one blockade, relocate, lose 1 action
  | 'COUNTER_SURVEILLANCE' // one wiretap on you returns CLEAR
  | 'KONTROLLE_SCHEDULE' // see the whole blockade schedule
  | 'FORGED_PAPERS' // free, silent checkpoint crossings
  | 'CUTOUT' // first 3 burn track entries hide their color
  | 'SLEEPER_CELL' // learn the killer's node when an agent burns
  | 'BAGMAN'; // +1 Intel per round

/** Reusable operation card. Gated by Intel cost and cooldown, never consumed. */
export interface ActiveCard {
  readonly kind: 'ACTIVE';
  readonly id: CardId;
  readonly name: string;
  readonly icon: IconType;
  readonly sector: Sector;
  readonly intelCost: number;
  /** Rounds before this card can be played again. Shared across a player's agents. */
  readonly cooldown: number;
  readonly budgetPoints: number;
  readonly text: string;
}

/** Automatic card. Never played, never costs an action. Most are consumed on trigger. */
export interface PassiveCard {
  readonly kind: 'PASSIVE';
  readonly id: CardId;
  readonly name: string;
  /** Passives still count against the per-icon loadout maximum. */
  readonly icon: IconType;
  readonly sector: Sector;
  readonly effect: PassiveEffect;
  /** true = single use, removed when it fires. false = permanent. */
  readonly consumable: boolean;
  readonly budgetPoints: number;
  readonly text: string;
}

export type Card = ActiveCard | PassiveCard;

/** A player's 10-card dossier. */
export type Loadout = readonly CardId[];

export interface LoadoutConstraints {
  readonly size: number;
  readonly maxPerIcon: number;
  readonly minColors: number;
  readonly maxBudgetPoints: number;
}

export interface LoadoutViolation {
  readonly code:
    | 'WRONG_SIZE'
    | 'UNKNOWN_CARD'
    | 'ICON_LIMIT'
    | 'TOO_FEW_COLORS'
    | 'OVER_BUDGET';
  readonly message: string;
}

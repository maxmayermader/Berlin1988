import type { BlockadeMode, Difficulty, PersonalityId, Sector } from './enums.js';
import type { PlayerId } from './ids.js';

export interface SeatConfig {
  readonly id: PlayerId;
  readonly name: string;
  readonly faction: Sector;
  readonly kind: 'HUMAN' | 'BOT';
  readonly personality?: PersonalityId;
  readonly difficulty?: Difficulty;
  /** Team id for 2v2. Null in free-for-all. */
  readonly team: string | null;
}

/**
 * Everything the host configures in the lobby. Locked when the match starts.
 * See docs/GAME_DESIGN.md §2.
 */
export interface MatchSettings {
  readonly seats: readonly SeatConfig[];
  /** 1 or 2. The single biggest dial in the game. */
  readonly agentsPerPlayer: 1 | 2;
  readonly mapId: string;
  readonly teams: boolean;
  readonly roundTimerSeconds: number | null;
  readonly pausesPerPlayer: number;
  readonly roundLimit: number;
  readonly dossierCount: number;
  readonly startingIntel: number;
  readonly blockadeMode: BlockadeMode;
  readonly rulesetId: string;
}

/**
 * The tunable numbers. One object so the sim harness can sweep them.
 * See docs/GAME_DESIGN.md §13.
 */
export interface Ruleset {
  readonly id: string;

  // Economy
  readonly intelPerRound: number;
  readonly intelPerExtraAgent: number;
  readonly intelPerInformant: number;
  readonly intelCap: number;
  readonly intelPerHeldAction: number;

  // Movement
  readonly actionsPerAgent: number;
  readonly sprintIntelCost: number;
  readonly sprintDistance: number;
  readonly maxSprintsPerAgentPerRound: number;
  readonly tunnelIntelCost: number;
  readonly checkpointIntelCost: number;

  // Combat
  readonly ambushIntelCost: number;
  readonly ambushCostsAction: boolean;
  readonly ambushDurationRounds: number;
  readonly silencerIntelCost: number;
  readonly maxSilencersHeld: number;
  readonly k9WinChanceBonus: number;

  // Decoys
  readonly maxActiveDecoys: number;
  readonly decoyDurationRounds: number;

  // Blockades
  readonly blockadeStartRound: number;
  readonly blockadeChancePerRound: number;
  readonly blockadeMinDuration: number;
  readonly blockadeMaxDuration: number;
  readonly blockadeActionPenalty: number;

  // Objectives
  readonly dossiersToExtract: number;
  readonly dossierRespawnDelay: number;
  readonly maxDossiersCarried: number;

  // Scoring
  readonly scorePerDossier: number;
  readonly scorePerInformant: number;
  readonly scorePerBurn: number;

  // Loadout
  readonly loadoutSize: number;
  readonly maxPerIcon: number;
  readonly minColors: number;
  readonly maxBudgetPoints: number;
}

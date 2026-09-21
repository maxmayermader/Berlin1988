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
 * The subset of MatchSettings a host actually configures in the lobby
 * (LOBBY-08..LOBBY-12). Deliberately narrower than MatchSettings: `seats` is
 * owned by the seat machine, `mapId` is derived from the seat count (MAP-03),
 * and `teams`/`pausesPerPlayer`/`startingIntel`/`rulesetId` have no UI and no
 * honoring code path yet — exposing a control for a field nothing reads is
 * the "placebo control" failure this type exists to make structurally
 * impossible.
 */
export interface LobbySettings {
  readonly agentsPerPlayer: 1 | 2;
  /** Null means no round clock at all. */
  readonly roundTimerSeconds: number | null;
  readonly roundLimit: number;
  readonly blockadeMode: BlockadeMode;
  readonly dossierCount: number;
}

/**
 * The allowed range for every host-settable field, as data. The lobby UI
 * renders its controls from this table and the room validates against this
 * same table — one source, so a control can never offer a value the server
 * will refuse (LOBBY-14). Bounds are inclusive.
 */
export const SETTINGS_BOUNDS = {
  agentsPerPlayer: [1, 2] as const,
  /** null (no clock) plus this inclusive range in seconds. */
  roundTimerSeconds: { min: 30, max: 180, step: 15 },
  roundLimit: { min: 8, max: 20, step: 1 },
  blockadeMode: ['OFF', 'ANNOUNCED', 'RANDOM', 'MIXED'] as const,
  dossierCount: { min: 1, max: 5, step: 1 },
} as const;

/**
 * How many dossiers a match of `playerCount` players should open with
 * (MAP-04's "dossier count tuned for the player count").
 *
 * Measured, not guessed — `pnpm sim --matches 300` per cell, HANDLER tier,
 * 2 agents. The target is duel-12's own match shape at its tested value of
 * 2 dossiers: 59% extraction / 33% round limit.
 *
 *   FFA-16 (3P):  2 -> 45% extraction / 55% round limit
 *                 3 -> 61% / 38%   <- matches duel-12's shape
 *                 4 -> 78% / 21%   (matches end at 10.8 rounds; too fast)
 *   FFA-18 (4P):  2 -> 40% / 59%
 *                 3 -> 62% / 37%   <- matches duel-12's shape
 *                 4 -> 78% / 22%
 *
 * The bigger boards need the third dossier because the same two dossiers
 * spread over 16-18 nodes make the return trip long enough that the round
 * limit arrives first — the match stops being about the objective.
 */
export function defaultDossierCount(playerCount: number): number {
  return playerCount >= 3 ? 3 : 2;
}

/**
 * What a fresh lobby opens at, for a room of `playerCount` seats.
 *
 * 90s matches the round clock the room already ran all of v1.0 —
 * deliberately not docs/GAME_DESIGN.md §1's 60s, because two agents means
 * four actions under one clock and 60s is untested for that load. A host who
 * wants 60s can set it; this is the default, not a rule.
 */
export function defaultLobbySettings(playerCount: number): LobbySettings {
  return {
    agentsPerPlayer: 2,
    roundTimerSeconds: 90,
    roundLimit: 14,
    blockadeMode: 'MIXED',
    dossierCount: defaultDossierCount(playerCount),
  };
}

/** The defaults for a room at its opening seat count (4). */
export const DEFAULT_LOBBY_SETTINGS: LobbySettings = defaultLobbySettings(4);

/** True when `value` sits inside the inclusive numeric bound for `field`. */
function withinBound(value: number, bound: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= bound.min && value <= bound.max;
}

/**
 * The single authority on whether a LobbySettings object is legal — called by
 * the room before any mutation, and by the client only to disable controls.
 * Returns the offending field name, or null when every field is in range.
 * Never throws: an out-of-range value is an expected client error, not a
 * programmer error.
 */
export function invalidSettingsField(settings: LobbySettings): keyof LobbySettings | null {
  if (settings.agentsPerPlayer !== 1 && settings.agentsPerPlayer !== 2) return 'agentsPerPlayer';
  if (
    settings.roundTimerSeconds !== null &&
    !withinBound(settings.roundTimerSeconds, SETTINGS_BOUNDS.roundTimerSeconds)
  ) {
    return 'roundTimerSeconds';
  }
  if (!withinBound(settings.roundLimit, SETTINGS_BOUNDS.roundLimit)) return 'roundLimit';
  if (!SETTINGS_BOUNDS.blockadeMode.includes(settings.blockadeMode)) return 'blockadeMode';
  if (!withinBound(settings.dossierCount, SETTINGS_BOUNDS.dossierCount)) return 'dossierCount';
  return null;
}

/**
 * The map a match with `playerCount` seats is played on (MAP-03). A pure
 * lookup living in shared so the lobby can show the host which map their
 * current seat count selects, without the client owning the rule.
 */
export function mapIdForPlayerCount(playerCount: number): string {
  if (playerCount >= 4) return 'ffa-18';
  if (playerCount === 3) return 'ffa-16';
  return 'duel-12';
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

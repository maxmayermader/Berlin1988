import type { Ruleset } from '@berlin/shared';

/**
 * Every tunable number in the game, in one object so packages/ai/sim can sweep
 * them. A magic number anywhere in src/resolution is a bug.
 *
 * Values marked BALANCE are the seven levers from docs/GAME_DESIGN.md §13,
 * ordered by expected impact. None of them are confirmed — they are the
 * starting hypotheses the simulation harness exists to test.
 */
export const DEFAULT_RULESET: Ruleset = {
  id: 'default',

  // Economy
  intelPerRound: 2, // BALANCE #2 — sets match tempo
  intelPerExtraAgent: 1, // must scale with agent count or 2-agent games starve
  intelPerInformant: 1,
  intelCap: 15,
  intelPerHeldAction: 1,

  // Movement
  actionsPerAgent: 2,
  sprintIntelCost: 1,
  sprintDistance: 2,
  maxSprintsPerAgentPerRound: 1, // open decision §12.4
  tunnelIntelCost: 1,
  checkpointIntelCost: 1,

  // Combat
  ambushIntelCost: 3, // BALANCE #3
  /**
   * DECIDED: an ambush costs Intel but no action.
   *
   * Laying a trap therefore no longer competes with moving or striking — Intel
   * and the Strike card's cooldown are its only brakes. An agent can still only
   * trap the node it is standing on, and not one it has already trapped, so
   * this works out to at most one new trap per agent per round.
   *
   * Kept as a flag rather than hardcoded so the sim harness can measure it both
   * ways: free traps are a significant tempo change and the cost may need to
   * rise to compensate.
   */
  ambushCostsAction: false,
  ambushDurationRounds: 3,
  silencerIntelCost: 2,
  maxSilencersHeld: 2,
  k9WinChanceBonus: 0.25,

  // Decoys
  maxActiveDecoys: 2,
  decoyDurationRounds: 3,

  // Blockades
  blockadeStartRound: 7, // BALANCE #4
  blockadeChancePerRound: 0.35,
  blockadeMinDuration: 2,
  blockadeMaxDuration: 3,
  blockadeActionPenalty: 1,

  // Objectives
  dossiersToExtract: 3,
  dossierRespawnDelay: 2,
  maxDossiersCarried: 3,

  // Scoring
  scorePerDossier: 3,
  scorePerInformant: 1,
  scorePerBurn: 2,

  // Loadout
  loadoutSize: 10,
  maxPerIcon: 3,
  minColors: 2,
  /**
   * BALANCE #6. Raised from the design doc's opening guess of 20 once the
   * starter loadouts were actually costed: at 20 the cheapest legal 10 cards
   * come to 17, so almost every interesting deck was illegal and the only
   * viable builds were piles of 2-point filler. 26 (avg 2.6/card) leaves room
   * for a premium card or two without making a full deck of them affordable.
   */
  maxBudgetPoints: 26,
};

/**
 * Experimental variants for balance sweeps. The first question the sim harness
 * must answer is whether reusable strikes plus permanent death end matches too
 * fast — these two bracket the default on that axis.
 */
export const RULESETS: Record<string, Ruleset> = {
  default: DEFAULT_RULESET,

  /**
   * FROZEN. Golden replay fixtures run against this and nothing else.
   *
   * Do not tune it, ever — that is the whole point. Balance work happens on
   * `default`, and pinning the fixtures here means a deliberate cost change
   * doesn't invalidate the regression net that catches accidental rule changes.
   * If this ever has to move, mint `frozen-v2` and regenerate the fixtures.
   */
  'frozen-v1': { ...DEFAULT_RULESET, id: 'frozen-v1' },

  /** Violence is expensive and slow. Expect longer, more paranoid matches. */
  cold: {
    ...DEFAULT_RULESET,
    id: 'cold',
    blockadeStartRound: 9,
    ambushIntelCost: 4,
  },

  /** Violence is cheap. Expect fast, bloody matches — the failure case to test for. */
  hot: {
    ...DEFAULT_RULESET,
    id: 'hot',
    intelPerRound: 3,
    ambushIntelCost: 2,
    blockadeStartRound: 5,
  },
};

export function getRuleset(id: string): Ruleset {
  const r = RULESETS[id];
  if (!r) throw new Error(`Unknown ruleset: ${id}`);
  return r;
}

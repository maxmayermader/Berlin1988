import type { Difficulty } from '@berlin/shared';

/**
 * Difficulty adjusts HOW WELL the bot reasons, never how much it knows.
 *
 * "Belief noise" degrades inference, which is the honest way to make an
 * opponent weaker — a Recruit-tier Vogel still sweeps like Vogel, he is just
 * genuinely bad at reading the evidence. Contrast with the dishonest
 * alternatives we are not using: handing the bot your position and asking it
 * to pretend, or making it play at random.
 */
export interface DifficultyTier {
  readonly id: Difficulty;
  readonly label: string;
  /** 0..1 blend toward uniform in the particle filter each round. */
  readonly beliefNoise: number;
  /** Softmax temperature. Low = near-greedy, high = loose and human-ish. */
  readonly temperature: number;
  /** Chance of substituting the second-best move — a human mistake, not noise. */
  readonly blunderRate: number;
  /** Score both agents together instead of greedily one at a time. */
  readonly jointPlanning: boolean;
  /** Track the opponent's habits (Sable needs this to be itself). */
  readonly habitModelling: boolean;
  /** Floor on the belief distribution — higher recovers faster but reads worse. */
  readonly beliefFloor: number;
}

export const TIERS: Record<Difficulty, DifficultyTier> = {
  RECRUIT: {
    id: 'RECRUIT',
    label: 'Recruit',
    beliefNoise: 0.3,
    temperature: 1.2,
    blunderRate: 0.25,
    jointPlanning: false,
    habitModelling: false,
    beliefFloor: 0.35,
  },
  FIELD_AGENT: {
    id: 'FIELD_AGENT',
    label: 'Field Agent',
    beliefNoise: 0.15,
    temperature: 0.7,
    blunderRate: 0.1,
    jointPlanning: false,
    habitModelling: false,
    beliefFloor: 0.2,
  },
  HANDLER: {
    id: 'HANDLER',
    label: 'Handler',
    beliefNoise: 0.05,
    temperature: 0.35,
    blunderRate: 0.03,
    jointPlanning: true,
    habitModelling: true,
    beliefFloor: 0.1,
  },
  SPYMASTER: {
    id: 'SPYMASTER',
    label: 'Spymaster',
    beliefNoise: 0,
    temperature: 0.15,
    blunderRate: 0,
    jointPlanning: true,
    habitModelling: true,
    beliefFloor: 0.05,
  },
};

export const DIFFICULTY_IDS = Object.keys(TIERS) as Difficulty[];

/**
 * Basic self-preservation, required from Field Agent up.
 *
 * Agents die permanently, so a bot that walks into an announced blockade or
 * fights on ground it believes a rival safehouse sits on is BROKEN, not weak —
 * the mistake ends its match. This is a floor, not a personality trait.
 */
export function enforcesSelfPreservation(tier: DifficultyTier): boolean {
  return tier.id !== 'RECRUIT';
}

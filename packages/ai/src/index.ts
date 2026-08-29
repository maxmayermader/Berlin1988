/**
 * @berlin/ai — the AI opponents. Five personalities × four difficulty tiers.
 *
 * Two constraints define this package:
 *
 *  1. `decide` takes a PlayerView and an agent id, nothing else. A bot sees
 *     exactly what a human in that seat sees. Difficulty degrades the bot's
 *     INFERENCE — belief noise, softmax temperature, blunder rate — never its
 *     information.
 *
 *  2. No LLM in the decision loop. Decisions must be deterministic under a
 *     seed, instant, free, and offline-capable. The Claude API may one day
 *     generate a bot's radio chatter; it will never pick a move.
 *
 * Full design in docs/AI_OPPONENTS.md.
 */

export { createAgent } from './agent.js';
export type { AIAgent } from './agent.js';

export { PERSONALITIES, PERSONALITY_IDS } from './personalities/index.js';
export type { Personality, Weights } from './personalities/index.js';

export { TIERS, DIFFICULTY_IDS, enforcesSelfPreservation } from './difficulty.js';
export type { DifficultyTier } from './difficulty.js';

export { FEATURE_KEYS } from './features.js';
export type { Features, FeatureKey } from './features.js';

export { createBelief, pAt, pAnyAt, peak, entropy, totalEntropy } from './belief.js';
export type { Belief } from './belief.js';

export { createThreatMap, trapRisk, safehouseRisk } from './threatMap.js';
export type { ThreatMap } from './threatMap.js';

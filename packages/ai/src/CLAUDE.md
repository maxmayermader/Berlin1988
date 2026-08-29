# packages/ai/src

The bot decision pipeline. Three stages: believe, score, choose.

## Expected files

| File | Role |
| :--- | :--- |
| `index.ts` | Public barrel — `AIAgent`, `createAgent` |
| `agent.ts` | Wires the three stages together; holds per-match belief state across rounds |
| `belief.ts` | **Particle filter** over opponent positions. Predict → weight by evidence → resample. 256 particles 🔧 |
| `threatMap.ts` | Coarser second layer: inferred P(trap), P(rival safehouse), P(blockade) per node. Feeds `survivalRisk` |
| `evidence.ts` | Turns each signal type (wiretap result, informant report, Radio Intercept, border crossing, graded strike report, "you are not alone", blockade) into a particle reweighting |
| `features.ts` | Feature extractors: `killProbability`, `trapValue`, `exposureCost`, `informationGain`, `economyDelta`, `objectiveProgress`, `survivalRisk`, `blockadeRisk`, `groundAdvantage`, `tempoValue` |
| `scoring.ts` | Weighted sum of features against a personality vector |
| `jointPlan.ts` | Scores a player's 1–2 agents together so they don't converge on the same target |
| `loadout.ts` | Builds a personality-appropriate 10-card loadout under the match's constraints |
| `select.ts` | Softmax at difficulty temperature, plus the blunder roll |
| `lookahead.ts` | 2–3 ply search for Handler and Spymaster tiers |
| `habits.ts` | Opponent habit histogram — Sable's adaptive model, feeds the filter's transition weights |
| `difficulty.ts` | The four tiers as parameter sets |

## Rules

- **Candidate moves come from `engine.legalOrders(view, agentId)`.** Never enumerate moves independently here — a second implementation will drift from the UI's and quietly give bots options humans don't have.
- **The threat map is inference, not knowledge.** It's built from public evidence — Burn Tracks showing Strike uses with no reported kill imply traps somewhere; repeated returns to an area imply a safehouse. It must be wrong often. If you find yourself reaching for `GameState` to make it accurate, stop: that's the cheat this whole package is designed to prevent.
- **Seeded randomness only.** Softmax sampling, blunder rolls, and resampling all draw from the agent's own seeded PRNG. Same seed plus same view history must produce the same order, every time — the validation suite depends on it.
- **Belief state persists across rounds within a match**, held on the agent instance. It is *not* part of `GameState`; it's the bot's private reasoning.
- **Wrong beliefs are the point.** When a decoy fools the filter it should stay fooled for several rounds. Don't add correction hacks that quietly restore the truth — that's cheating with extra steps.
- Keep feature extractors cheap and independent. They run over every legal order, every round, at every lookahead node.

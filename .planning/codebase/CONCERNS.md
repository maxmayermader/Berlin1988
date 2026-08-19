# Codebase Concerns

**Analysis Date:** 2026-08-18

## Tech Debt

### Resolution Pipeline Ordering Fragility

**Issue:** The round resolution pipeline is the hardest code in the project and the easiest to get subtly wrong.
- **Files:** `packages/engine/src/resolution/` — 11-step pipeline across multiple modules (`index.ts`, `strikes.ts`, `contested.ts`, etc.)
- **Impact:** Medium-High. A single misaligned PRNG draw or step reordering makes replays diverge, corruption cascades through all downstream phases, and bugs are invisible until golden tests fail.
- **Root cause:** Three separate systems draw randomness mid-match: **contested-node rolls** (50/50 or 75/25), **blockade scheduling** (pre-rolled at match creation but advanced during resolution), and **dossier respawn placement**. All three tap the same seeded PRNG stream. The stream must advance in a fixed order regardless of which branches execute — e.g., even if no contested roll happens this round, the PRNG position must advance as if it had.
- **Fix approach:**
  - Enforce strict PRNG advancement order in tests — add a property test that validates PRNG state is identical regardless of submission order or action availability
  - Document PRNG consumption order in `packages/engine/src/rng.ts` and pin it with assertions
  - Every refactor of `src/resolution/` must regenerate golden fixtures with `UPDATE_GOLDEN=1 pnpm test golden` and review the diff

### Ambush Spam Prevention is Cost-Only

**Issue:** Ambushes now cost Intel only, no action slot. The spam ceiling is bounded by three mechanisms: one-trap-per-agent-per-node rule, Intel cost (3), and Strike card cooldown (2 rounds). If any weakens, traps become dominant.
- **Files:** `packages/engine/src/legalOrders.ts` (lines 65-76 enumerate free ambushes), `packages/engine/src/content/` (ruleset has `ambushIntelCost` and `ambushCostsAction` flags)
- **Impact:** Medium. A map turning into a minefield makes contested movement impossible and invalidates Strike-based strategies. Design doc lists this as "most likely number to need raising" (§12 open decisions).
- **Current state:** `pnpm sim --matches 300 --profile` validates the settings don't create unbreakable spam, but this depends on balance sweeps staying current.
- **Fix approach:**
  - Sim harness sweeps both `ambushIntelCost` and `ambushCostsAction` every balance pass — these two numbers are load-bearing
  - If a season-end telemetry pass shows trap density >0.4 per node on average, raise `ambushIntelCost` to 4 and re-sweep
  - Consider the flag `ambushCostsAction` as an emergency brake if spam returns: it's deferred, not rejected

## Known Bugs

### Katja (Ghost Personality) Over-Strong in Duels

**Issue:** Katja wins 84% of duel matches even after all documented fixes (evasion scoring, belief reweighting, denial value).
- **Files:** `packages/ai/src/personalities/index.ts` (Katja weight vector), `docs/AI_OPPONENTS.md` §7 lists measurement
- **Current state:** Validated and confirmed — this is a design problem, not a bot implementation bug. Evasion is genuinely strong when only one opponent hunts.
- **Candidates for fix:** Per `docs/AI_OPPONENTS.md` §7, the options are: (1) make dossier pickup reveal more info than just the node, (2) raise respawn delay on the extraction point, or (3) shrink the duel map from 12 to 10–11 nodes. None implemented yet.
- **Impact:** Medium. Solo play (the most accessible mode) defaults to duel 1v1 with Katja as a starting opponent. 84% loss rate kills retention. This must be solved before Phase 2 ships a playable board.
- **Timeline:** Decides one of the three design options before golden fixtures lock in Phase 4. Reshuffling dossier mechanics or map size invalidates all existing balance sweeps.

### Lookahead Not Implemented for Handler/Spymaster

**Issue:** Documentation claims Handler tier (2 ply) and Spymaster (3 ply) do lookahead search. They currently do not.
- **Files:** `docs/AI_OPPONENTS.md` §4 describes it; `packages/ai/src/lookahead.ts` exists but is not wired into the decision path
- **Current state:** Handler and Spymaster differ from lower tiers only by belief noise (5% vs. 15% vs. 30%), softmax temperature (0.35 vs. 0.7 vs. 1.2), blunder rate (3% vs. 10% vs. 25%), and joint agent planning. Lookahead is completely absent.
- **Impact:** Low-Medium. The monotonicity validation gate still passes without lookahead, so Spymaster beats Handler beats Field Agent. But the feature is documented as shipped and isn't; users expecting Spymaster to think 3 moves ahead will find it doesn't.
- **Fix approach:**
  - Wire `lookahead.ts` into the decision path in `packages/ai/src/agent.ts`, conditioned on `difficulty >= 'HANDLER'`
  - Validate speed still holds (p99 <50ms); if not, cache lookahead simulations or cut to 2 ply
  - Re-run validation suite after implementing — lookahead may push Spymaster's win rate and require a balance adjustment to stay healthy

## Security Considerations

### Fog-of-War State Leakage Risk

**Issue:** Four categories of hidden state must never reach a client: **agent positions** (obvious), **safehouses** (permanent, tiebreaker for contested nodes), **active traps**, and **cooldown timers**. The type system makes positions and safehouses unrepresentable in `PlayerView`, but traps and cooldowns are less obvious.
- **Files:** `packages/shared/src/view.ts` (PlayerView type), `packages/engine/tests/fog-leak.test.ts` (leak scan with deep serialization check)
- **Current mitigation:** 
  - `PlayerView` has no field capable of holding another player's position, safehouse, or active trap — this is enforced structurally
  - Leak scan runs over randomized states and fails the build if any serialized PlayerView contains an opponent node id
  - Cooldowns are already public (Burn Track shows card usage, so cooldown state is inferred)
- **Remaining risk:** A future PR adds a new field to PlayerView without realizing it can hold hidden data. The leak scan catches positions/safehouses/traps but would miss a field like `lastKillerNode` that reveals strike origin. **Every addition to PlayerView must be reviewed as a security change.**
- **Fix approach:**
  - Add a lint rule that flags new fields on PlayerView with a "review as security change" comment requirement
  - Expand fog-leak.test.ts to check for any field that could transitively hold opponent data (not just direct node ids)
  - Document the four categories in a code comment above PlayerView definition

### Passive Card Inference Assumption

**Issue:** Bots infer which passive cards opponents still hold by reading their Burn Track. The inference assumes that if a Burn Track shows no `GHOST_PROTOCOL` entries, the player hasn't used it yet or is holding it. But a bluff loadout (spending Intel on fake cards) can misdirect this.
- **Files:** `packages/ai/src/threatMap.ts`, `packages/ai/src/evidence.ts` (where Burn Track is read to build threat assumptions)
- **Current state:** Documented as inference, not as cheating. Bots already read Burn Tracks publicly. The risk is subtle: if a rival's Burn Track shows five Strike uses with no reported kills, inference concludes "three traps are somewhere" — but those might be fake burns from a loadout bluff.
- **Impact:** Low. Bluff tactics are metagame (expensive to execute, easy to punish), and bot inference being fooled by bluffs is the intended behavior. The leak scan doesn't flag this because Burn Tracks are public.
- **Mitigation:** Already implicit. Bots should be wrong often; that's what makes traps satisfying to land.

## Performance Bottlenecks

### Bot Decision Latency Under Joint Planning

**Issue:** With 2 agents, a bot must score jointly (both agents conditioned on the other's choice) to avoid converging on the same target. This doubles the legal-order enumeration: score all candidates for agent A, then for each top candidate, enumerate and score all of agent B's candidates.
- **Files:** `packages/ai/src/jointPlan.ts`, validation measured in `packages/ai/tests/validation.test.ts`
- **Current performance:** p99 is under 50ms at Spymaster with 2 agents across all personalities. Determinism validation gate passes.
- **Scaling risk:** If lookahead is implemented (which is pending), the joint scoring + lookahead combination could push p99 over 50ms. With 18 nodes and ~20 legal orders per agent per ply, 3-ply lookahead on both agents is ~8,000 simulations.
- **Fix approach:**
  - Profile lookahead implementation before merging to ensure p99 <50ms
  - If lookahead exceeds 50ms, implement memoization of lookahead subtrees (same view state = cached result) or cut Spymaster to 2 ply only

### Belief Filter Resampling Cost

**Issue:** The particle filter over opponent positions runs per round. With 18-node maps and 4 players, every bot maintains 3 belief clouds. Reweighting and resampling each cloud is microseconds individually but can accumulate.
- **Files:** `packages/ai/src/belief.ts` (predict, reweight, resample functions)
- **Current state:** Exact computation, not sampled — no sampling error, microseconds per cloud.
- **Risk:** Negligible at current map sizes, but if a campaign mode scales to 20+ nodes or adds more players, the O(opponents × nodes) becomes noticeable.
- **Mitigation:** Already mitigated. Exact computation is faster than sampling; only revisit if maps grow significantly.

## Fragile Areas

### Duel Mode with 1 Agent

**Issue:** A 1-agent FFA with permanent death means a player can be on the bench in round 3 with 11 rounds left to watch.
- **Files:** `docs/GAME_DESIGN.md` §2 (recommendation to default FFA to 2 agents), `docs/GAME_DESIGN.md` §12 (open decision #5)
- **Current mitigation:** Design doc recommends defaulting FFA to 2 agents; host can override. Eliminated players get spectator seats (own fog only).
- **Why fragile:** The design is correct — 2 agents is better. But if playtesting finds players don't read the recommendation and launch 4-player 1-agent games anyway, retention drops. The spectator feature exists but doesn't solve "I'm out of the game."
- **Fix approach:**
  - Make the UI's "quick start" default to 2 agents
  - Add a warning in the lobby if 1-agent FFA is selected: "Dead players become spectators for the rest of the match. Consider 2 agents."
  - Track telemetry: if >30% of 1-agent FFAs have someone eliminated by round 4, revisit whether the default should force 2 agents for social modes

### Contested Node Resolution Correctness

**Issue:** The contested-node ladder (`packages/engine/src/resolution/contested.ts`) has five ordered branches, each consumes PRNG draws, and all are fixed-order. A single reordering or missing PRNG advance breaks replays.
- **Files:** `packages/engine/tests/contested.test.ts` validates every branch; `packages/engine/src/resolution/contested.ts` implements the ladder
- **Current coverage:** All five branches tested at fixed seed. Mutual traps, safehouse tiebreak, neutral 50/50 (both winners validated), K9 at ~75%, double-K9 cancel. Plus Dead Drop escapes and safe co-location.
- **Gap:** The test uses fixed seeds and doesn't validate that the PRNG stream never diverges between runs. A property test (submit same orders in different order, same PRNG outcome) would catch this.
- **Fix approach:**
  - Add property test: for every recorded golden match, replay it with orders submitted in random order and assert final state is byte-identical
  - Already there: `determinism.test.ts` does exactly this. No action needed, but document the dependency.

### Blockade Schedule Pre-Rolling

**Issue:** The blockade schedule is rolled once at match creation (`packages/engine/src/createMatch.ts` line 82) and never changes. A player holding *Kontrolle Schedule* reads this pre-rolled schedule. If the schedule algorithm ever changes, all active matches become instant-losers for anyone who relied on the old schedule.
- **Files:** `packages/engine/src/createMatch.ts`, `packages/engine/src/resolution/blockade.ts` (schedule consumption)
- **Current state:** Schedule is immutable once created. Golden fixtures validate it doesn't resample mid-match.
- **Risk:** Low. The schedule algorithm is stable and documented. But if a balance pass changes blockade frequency, all in-flight matches see the new schedule retroactively.
- **Mitigation:** Ruleset versioning (planned for Phase 8). Ship live matches pinned to a ruleset version so a rebalance doesn't retro-change in-flight matches.

## Scaling Limits

### Map Size and Move Generation

**Issue:** Legal-order generation (`packages/engine/src/legalOrders.ts`) enumerates all reachable nodes for movement and all edge-adjacent nodes for strikes. With a 18-node map and average degree 3.2, this is ~50 candidates per agent per round. Reachable nodes for 1–2 moves + operations grow the list further.
- **Files:** `packages/engine/src/legalOrders.ts`, `packages/ai/src/features.ts` (features are evaluated over every legal order)
- **Current scale:** 12–18 nodes, ~50–80 legal orders per agent per round. Per-bot decision time <50ms, feature extraction is sub-millisecond per order.
- **Scaling risk:** If a future version expands to 30+ nodes or increases edges (more interconnectedness), the O(legal-orders) enumeration could become noticeable. Joint planning is O(candidates_A × candidates_B); 150 × 150 lookahead simulations blow the 50ms budget.
- **Mitigation:** Not urgent. Current maps are stable. If expansion is planned, profile first; if needed, implement candidate pruning (only score the top 30 orders by heuristic).

### Simultaneous Turn Resolution Under Network Delay

**Issue:** Simultaneous turn resolution requires all players to commit before resolution starts. A slow player's delay is the whole table's delay.
- **Files:** `apps/party/src/CLAUDE.md` describes the room server (not yet implemented), protocol in `docs/ARCHITECTURE.md` §5
- **Current mitigation:** 60-second default timer with unanimous pause. Anyone who times out auto-Holds (banking +1 Intel). A timeout is wasteful, not catastrophic.
- **Risk:** If network latency to PartyKit reaches >2 seconds per player, even a 5-player game has 10 seconds of latency before resolution can start, leaving 50 seconds to submit. This is acceptable. But if P2P or offline play is added, simultaneous resolution without a server authority becomes much harder.
- **Fix approach:** Already addressed by current architecture. Phase 5 will implement and measure actual submission times; if 60s is too tight, increase the default to 90s.

## Test Coverage Gaps

### No Real-Time Playtest of 4-Action-Per-Round Timing

**Issue:** Design doc claims 2 agents × 2 actions per round in 60 seconds is playable, but this has never been validated with humans.
- **Files:** `docs/GAME_DESIGN.md` §12 (open decision #4), `docs/GAME_DESIGN.md` §7.1 (60s timer as default)
- **Current state:** Headless sim harness measures bot decision latency (<50ms), but bot speed ≠ human speed. A human needs to read the board, understand legal moves, plan, commit, and maybe coordinate with a co-player.
- **Gap:** Phase 2 (Playable Board) must include a first-playtest measurement. Collect `(submission_time, agents, round_number)` telemetry and analyze:
  - Are most submissions ≤20s (leaving margin)?
  - Do late rounds see timeouts?
  - Do 2-agent players systematically timeout more than 1-agent?
- **Fix approach:**
  - Phase 2: log submission times client-side, send to server
  - Phase 3 (post-playtest): if p75 submission time >40s, increase default timer to 90s
  - If timeouts are >5%, increase to 120s and re-measure

### Missing Difficulty Monotonicity Test for Lookahead

**Issue:** Once lookahead is implemented, the validation suite must confirm Spymaster > Handler > Field Agent > Recruit still holds. Currently it passes without lookahead, so the gate isn't testing lookahead's contribution.
- **Files:** `packages/ai/tests/validation.test.ts` (difficulty monotonicity gate), lookahead pending implementation
- **Risk:** Low. Monotonicity is a gating test with wide margins (Spymaster should beat Recruit by >20%). But if lookahead has a subtle bug, monotonicity might hide it if the margin is wide enough.
- **Fix approach:**
  - After lookahead implementation, add a sub-test: measure the gap between each tier pair and assert it narrowed (lookahead should make higher tiers stronger)
  - If gap widened or flipped, lookahead has a bug

### Passive Card Trigger Timing Not Fuzzed

**Issue:** Passives trigger at fixed pipeline steps (e.g., Dead Drop at ambush trigger = step 5). The test suite covers the main cases but doesn't fuzz all permutations of passive + timing + damage type.
- **Files:** `packages/engine/tests/rules.test.ts` (passive tests), `packages/engine/src/resolution/` (each passive trigger point)
- **Current coverage:** Golden fixtures + unit tests cover documented cases (Dead Drop escape, Ghost Protocol vs. Strike, K9 in contested roll, Tunnel Rat in blockade, Counter-Surveillance vs. Wiretap, etc.). But a fuzz test would try all combinations.
- **Gap:** A loadout with 4 passives + simultaneous threats (e.g., ambush + blockade + strike) might trigger passives in unexpected order.
- **Fix approach:**
  - Add a property test: generate random loadouts with multiple passives, place agents in overlapping threats (ambush + blockade, trap + strike, etc.), and assert final state is valid (no orphaned dossiers, no double-triggers)
  - This is nice-to-have, not urgent — the harness already soak-tests 1,400+ matches and would have found combinatorial issues

## Missing Critical Features

### Phase 2 (Playable Board) Not Implemented

**Issue:** The entire UI is a skeleton. No game is playable yet.
- **Files:** `apps/web/app/`, `apps/web/components/`, `apps/web/lib/` (all contain only CLAUDE.md)
- **Scope per plan.md:** SVG board, order composer (2 actions per agent), legal-move highlighting, Intel cost preview, cooldown state, Burn Track panel, signals log, round clock + pause flow, resolution replay, keyboard navigation, reduced-motion support.
- **Timeline:** Phase 2 is next after Phase 1 completion. Blocking ship.
- **Risks unique to this phase:**
  - Resolution replay must teach the game's ordering rules (§9 of architecture doc). This is the highest-fidelity documentation of the rules and will catch ambiguity.
  - Simultaneous turn UX is unfamiliar to most players. The UI must make "everyone commits secret" obvious and never let the last player see what others did.
  - SVG board scaling across 12–18 nodes on mobile (portrait) is non-trivial. Must ship responsive.

### Phase 5 (Multiplayer) Not Implemented

**Issue:** The room server (`apps/party`) is a skeleton. No realtime play yet.
- **Files:** `apps/party/src/` (only CLAUDE.md)
- **Scope per plan.md:** Room Durable Object, GameState authority, protocol Zod validation, simultaneous commit + reveal, host-only settings with server-side enforcement, timers via alarms, auto-Hold on timeout, unanimous pause poll, reconnection, spectator seats, mixed human/bot lobbies, ready-up, E2E on seeded match.
- **Risks:**
  - PartyKit cold-start and state hydration must be instant (<100ms for reconnection UX)
  - Durable Object state durability is PartyKit's job, but message queueing under high player count (4 agents × 4 players × 2 messages per round = 32 messages) could saturate the connection if not batched

## Dependencies at Risk

### Zod Major Version Stability

**Issue:** `packages/shared` uses Zod for wire-protocol validation. No lock on a major version.
- **Files:** `packages/shared/package.json` (currently no devDependencies listed for zod; check actual config)
- **Current state:** Zod is a runtime dependency of `shared`. The codebase validates every client→server message with Zod schemas, so a breaking change breaks message handling.
- **Risk:** Low. Zod is stable and widely used. But if a Zod v5+ ships with API changes, migration is non-trivial across all validation sites.
- **Fix approach:**
  - Lock Zod to a major version in root `package.json`
  - Pin the version once Phase 2 ships and stable message schemas exist

### PartyKit / Durable Objects Availability

**Issue:** Realtime play is entirely on PartyKit (Cloudflare Durable Objects via a wrapper). If PartyKit becomes a constraint or sunsets, migration is necessary.
- **Files:** `docs/ARCHITECTURE.md` §1.4, §8 (deployment notes on PartyKit)
- **Current mitigation:** Architecture doc acknowledges the risk and notes that PartyKit is a thin wrapper around raw Durable Objects. Migration to raw Durable Objects or a different realtime host is "mechanical" (a rewrite of the room entry point, not the rules engine).
- **Risk:** Low. PartyKit has a generous free tier, is maintained, and is the officially supported Durable Objects wrapper. But it's a single third-party dependency for a critical path.
- **Contingency:** Documented. If needed, migration to raw Durable Objects or Socket.IO is straightforward because the engine is pure and room-agnostic.

## Test Coverage Gaps

### Untested Asymmetric Loadout Interaction

**Issue:** Balance sweeps assume loadout distributions are homogeneous. In actual play, one player might hold *Kontrolle Schedule* and the other none. The interaction of different passive sets hasn't been fuzzed.
- **Files:** `packages/ai/sim/` (balance harness), `packages/ai/tests/validation.test.ts`
- **Current state:** `pnpm sim --matches 300` runs bots with auto-generated loadouts matched to personality. All-Vogel matches, all-Katja matches, etc. But Vogel vs. Katja with different loadout distributions isn't measured.
- **Gap:** A 300-match sweep of "all personality pairs with random loadouts from starter deck pool" would take 100 minutes. Not part of the standard CI run.
- **Fix approach:**
  - Add an optional `--asymmetric` flag to the sim harness that sweeps personality × loadout pairs
  - Run this quarterly before each balance season, not per-commit
  - Priority: Medium. Current starter decks are hand-tuned; if deckbuilding is added (Phase 4), asymmetry becomes critical

---

*Concerns audit: 2026-08-18*

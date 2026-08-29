# packages/engine/tests

The regression net for the rules. This suite is deliberately heavy — the engine is where bugs are most expensive and testing is cheapest.

## Expected files

| File | Proves |
| :--- | :--- |
| `helpers.ts` | The random-legal-move fuzzer, replay driver, and state fingerprint. Not a test |
| `scenario.ts` | Fluent builder for controlled positions. Rules tests set `pendingOrders` directly — they exercise resolution, not legality |
| `fog-leak.test.ts` | **The most important file here.** Scans serialized `PlayerView`s over randomized states for opponent agent ids, traps, decoys, and safehouses; checks `OpponentPublicInfo` has no field that could hold hidden state; checks node visibility is earned and Burn Tracks are identical for every viewer |
| `determinism.test.ts` | Same seed → same match; recorded scripts replay byte-identically; **submission order never changes the outcome** (the simultaneity guarantee) |
| `contested.test.ts` | Every branch of the §8.4 ladder — mutual traps, safehouse tiebreak, neutral 50/50 (asserting *both* winners actually occur), K9 at ~75% over 200 runs, double-K9 cancelling. Plus ambush triggers, Dead Drop escapes, and safe co-location |
| `rules.test.ts` | Strike noise grading, wiretap timing, passives, blockades, permanent burning with cleanup, objectives, loadout validation |
| `golden.test.ts` + `golden/*.json` | Recorded matches replay identically **across code changes**, pinned to the frozen ruleset |
| `soak.test.ts` | 1,400+ random-agent matches per run at 1 and 2 agents, duel and 4-player. No crashes, no hangs, no orphaned state, Intel always in range |

## Rules

- **Every bug fixed here gets a golden fixture.** That's the deal — a fixture is cheap, and a resolution-ordering bug that comes back is expensive.
- **Golden fixtures run against `frozen-v1`, never `default`.** Balance work retunes `default` constantly; pinning the fixtures to a frozen ruleset means a deliberate cost change doesn't invalidate the net that catches accidental rule changes. Regenerate with `UPDATE_GOLDEN=1 pnpm test golden` and read the diff before committing.
- **Test the rules, not the implementation.** Assert on the `ResolutionEvent[]` log and final state. Tests that reach into pipeline internals will fight every refactor of `src/resolution/`.
- `fog-leak.test.ts` is the most important file in this folder. If you add a field to `PlayerView`, confirm the scan still reaches it.

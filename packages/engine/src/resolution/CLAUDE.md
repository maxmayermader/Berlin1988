# packages/engine/src/resolution

The round pipeline — the hardest and most bug-prone code in the project. Everyone commits orders in secret, then everything resolves at once, in a **fixed, published order**.

## The eleven steps

One module per step, run in this sequence. The order is a game-design decision (`docs/GAME_DESIGN.md` §7.2), not an implementation detail — do not reorder it to make code convenient.

| # | Module | What it does |
| :---: | :--- | :--- |
| 1 | `arm.ts` | Passives arm; safehouses placed or relocated — must exist before anything tests against them |
| 2 | `traps.ts` | Ambushes set. A trap laid this round is live this round |
| 3 | `decoys.ts` | Decoys placed, so they're scannable this round |
| 4 | `movement.ts` | All agents move simultaneously. Sprints, tunnel and checkpoint tolls applied |
| 5 | `trapTriggers.ts` | Anyone who walked into a trap. Handles *Dead Drop* escapes and mutual-trap sealing |
| 6 | `blockades.ts` | Node closures; anyone standing in one is burned unless sheltered |
| 7 | `bribes.ts` | Informant captures, from post-move positions |
| 8 | `wiretaps.ts` | Scans resolve against where agents *arrived* |
| 9 | `strikes.ts` | Strikes resolve after scans. Striking agent advances into the target node |
| 10 | `contested.ts` | The §8.4 ladder — mutual traps, safehouse tiebreak, neutral roll, K9 |
| 11 | `objectives.ts` | Dossier pickup and extraction — last, so a burned agent can't extract |

`index.ts` composes them and emits the `ResolutionEvent[]` log the client animates.

## The contested-node ladder

`contested.ts` is the trickiest module and the one most likely to grow bugs. It is a strict ordered ladder, not a scoring system:

1. Mutual traps → entering agent burned, no escape, no roll
2. One side owns a safehouse on the node → that side wins outright
3. Neutral node → 50/50 from the seeded PRNG
4. K9 Unit held by one side → 75/25, consumed either way
5. Both hold K9 → both consumed, back to 50/50

Rules 3–5 consume PRNG draws, so the stream must advance **in a fixed order regardless of which branch runs** — otherwise two replays of the same match diverge.

## Rules

- **Every step reads the state as of the start of the round for its inputs, and writes to an accumulating draft.** Step 5 must see post-movement positions but must not see the results of step 6. Getting this wrong produces bugs that only show up in specific orderings, which is exactly what the property tests hunt for.
- **Submission order must never affect the outcome.** There's a property test asserting this. If you find yourself iterating players in seat order somewhere that matters, that's the bug.
- **Emit a `ResolutionEvent` for everything.** The event log is both the replay script and the audit trail. If something happened and no event was emitted, the client can't show it and the test suite can't check it.
- **Events are fog-filtered on the way out**, in `../fog`, not here. This module logs the truth; projection decides who sees what. Strike events carry the full node and let projection downgrade it to sector-level or suppress it for a silencer — never pre-redact here.
- **Burning is permanent and has to clean up after itself.** A burned agent drops carried dossiers on its node, and if it was the player's last agent, their informants go neutral and their safehouse, decoys, and traps are removed. Orphaned state from a dead player is the most likely source of "impossible" bugs later.
- **Cooldowns are per card, per player** — shared across both of a player's agents. Tick them in Upkeep, not here.
- Add a golden replay fixture for every bug you fix here.

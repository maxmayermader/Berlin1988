# packages/engine/src/fog

The fog-of-war boundary. Every byte that reaches a client passes through here. Treat changes to this folder as security changes.

## Expected files

| File | Role |
| :--- | :--- |
| `projectView.ts` | `GameState` → `PlayerView` for one player. The single sanctioned export path |
| `visibility.ts` | Which nodes a player can see: own node, adjacent nodes, owned informants, teammates' vision in 2v2 |
| `signals.ts` | Generates the per-round information drip — adjacency chatter, informant reports, Radio Intercepts, public events (`docs/GAME_DESIGN.md` §6) |
| `filterEvents.ts` | Reduces the full `ResolutionEvent[]` to the subset a given player is entitled to have seen |
| `strikeNoise.ts` | Grades strike reports per recipient: **exact node** for agents in adjacent nodes, **sector only** for everyone else, **nothing** if silenced (`docs/GAME_DESIGN.md` §5.2) |

## Rules

1. **`projectView` is the only export that produces client-bound data.** If something else in the codebase constructs a `PlayerView`, that's a bug.
2. **Build views by construction, not by deletion.** Start from an empty `PlayerView` and add what the player has earned. Never take a `GameState`, clone it, and strip fields — the day someone adds a new secret field, the deletion approach leaks it silently and the construction approach simply omits it.
3. **Radio Intercepts must be true.** They're deliberately vague, never false. A bot's particle filter and a human's deduction both treat them as hard constraints; a lie would poison both.
4. **Signal generation consumes the seeded PRNG** from `GameState` — which intercept fires must be reproducible in a replay.
5. **Four categories of hidden state, not one.** Agent positions are the obvious one. Also secret and easy to forget: a player's **safehouse** (permanent, and the tiebreaker for every contested node), their **active traps**, and their **cooldown timers**. Leaking a safehouse is arguably worse than leaking a position — positions change every round, safehouses don't.
6. **Grade, don't pre-redact.** The resolution log carries the truth; this folder decides how much of it each player gets. A strike is a single event downgraded per recipient, not three different events emitted upstream.
7. **Burn Tracks are symmetric.** Every player sees every Burn Track including their own, identically redacted (`docs/GAME_DESIGN.md` §6.3). There is no owner-only variant — *Cutout* redaction is applied once at append time, upstream of projection.
8. `tests/fog-leak.test.ts` deep-scans serialized views over randomized states for all four hidden categories. If you add a field to `PlayerView`, make sure that test still covers it.

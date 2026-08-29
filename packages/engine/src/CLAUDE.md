# packages/engine/src

Implementation of the rules engine. Everything is exported through `index.ts`.

## Expected files

| File | Role |
| :--- | :--- |
| `index.ts` | Public barrel — the five API functions and nothing else |
| `createMatch.ts` | Match setup from `MatchSettings`: seat players, spawn **1 or 2 agents each**, place dossiers, deal starting Intel, **pre-roll the blockade schedule** |
| `legalOrders.ts` | Enumerate legal actions for one agent from a `PlayerView`. Drives both the UI's affordances and the AI's candidate list — one implementation, so they can't disagree |
| `submitOrder.ts` | Validate and record one agent's two actions for the current round |
| `rng.ts` | Seeded PRNG (xoshiro128** or similar). The **only** source of randomness in the project |
| `graph.ts` | Map queries: adjacency, distance, tunnel reachability, checkpoint detection, **nearest safehouse-or-U-Bahn** for escape resolution |
| `cooldowns.ts` | Per-card, per-player cooldown state. Shared across a player's agents |
| `victory.ts` | Extraction / elimination / round-limit scoring checks |

## Subfolders

- `content/` — cards, maps, rulesets as data
- `resolution/` — the round pipeline
- `fog/` — view projection

## Rules

- **`rng.ts` is the single randomness source.** A lint rule bans `Math.random` in this package. Every consumer threads the PRNG through `GameState`, so nothing samples ambiently. Three systems draw from it mid-match — contested-node rolls, blockade scheduling, dossier respawns — and the stream must advance in a fixed order regardless of which branches run, or replays diverge.
- **The blockade schedule is rolled at match creation, not per round.** That's what makes the *Kontrolle Schedule* passive implementable: a player holding it simply reads a schedule that already exists.
- `legalOrders` must be usable from a `PlayerView` alone — the AI calls it with exactly what a human's client has. Requiring `GameState` here would quietly hand bots extra information.
- Keep files single-purpose. The resolution pipeline in particular is easier to review as many small modules than one large one.

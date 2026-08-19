# packages/shared/src

Implementation of `@berlin/shared`. Everything is re-exported through `index.ts` — deep imports from other packages are not allowed.

## Expected files

| File | Contents |
| :--- | :--- |
| `index.ts` | Public barrel. The only entry point |
| `ids.ts` | Branded id types: `PlayerId`, `NodeId`, `CardId`, `MatchId` |
| `enums.ts` | `Sector`, `IconType`, `EdgeType`, `MatchMode`, `Phase`, `Difficulty` |
| `cards.ts` | `ActiveCard`, `PassiveCard`, and loadout constraint types |
| `map.ts` | `NodeState`, `Edge`, `MapDefinition`, `BlockadeState` |
| `state.ts` | `GameState`, `PlayerSecrets` (agents, safehouse, traps, cooldowns) — server-only shapes |
| `view.ts` | `PlayerView`, `OpponentPublicInfo`, `Signal`, `BurnEntry`, `ClockState` — client-safe shapes |
| `orders.ts` | `Action` union, the `[Action, Action]` per-agent order, and the `ResolutionEvent` union |
| `settings.ts` | `MatchSettings` — the host's lobby options (`docs/GAME_DESIGN.md` §2) |
| `protocol.ts` | Zod schemas for every wire message, both directions |
| `ruleset.ts` | The tunable numbers (🔧 values from `docs/GAME_DESIGN.md` §13) as one object |

## Rules

- `state.ts` and `view.ts` stay separate files on purpose. The split is the fog boundary; keeping them apart makes an accidental re-export obvious in review.
- Derive types from Zod schemas (`z.infer`) rather than declaring both.
- No functions that decide anything. Shape definitions and trivial guards only.

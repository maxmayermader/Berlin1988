# packages/shared

`@berlin/shared` — the vocabulary of the whole project. Types, enums, and wire-protocol schemas. Everything else depends on this; it depends on nothing but Zod.

## What belongs here

- Core domain types: `Card`, `NodeState`, `PlayerSecrets`, `GameState`, `PlayerView`, `Order`, `ResolutionEvent`, `Signal`
- Enums: `Sector` (RED/BLUE/GOLD/GREEN), `IconType`, `EdgeType`, `MatchMode`, `Phase`
- Zod schemas for every client→server message
- Branded id types (`PlayerId`, `NodeId`, `CardId`) so ids can't be crossed accidentally
- Small pure helpers over those types

## What does not belong here

Game *logic*. If a function decides an outcome, it belongs in `engine`. This package describes shapes; it doesn't apply rules.

## The type that matters most

`PlayerView` is the fog-of-war boundary made structural. It must have **no field capable of holding another player's agent positions, safehouse, or active traps** — not optional, not nullable. If someone needs opponent data on the client, they add it to `OpponentPublicInfo`, which is reviewed as a security change.

Four categories of hidden state, and only the first is obvious: **agent positions**, the **safehouse** (permanent, and the tiebreaker for every contested node), **active ambush traps**, and **cooldown timers**. A leaked safehouse is arguably worse than a leaked position — positions change every round, safehouses don't.

See `docs/ARCHITECTURE.md` §4.1.

## Conventions

- Zod schemas are the source of truth for wire types; derive TS types with `z.infer`, don't hand-write both.
- Types only — no side effects, no I/O, nothing that reads a clock.

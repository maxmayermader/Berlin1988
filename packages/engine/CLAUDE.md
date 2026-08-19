# packages/engine

`@berlin/engine` — the rules of Berlin 1988 as pure functions. This is the most important package in the repo and the one with the strictest constraints.

## Public API

The entire surface is five functions:

```ts
createMatch(settings: MatchSettings, seed: string): GameState
legalOrders(view: PlayerView, agentId: AgentId): Action[]
submitOrder(state: GameState, playerId: PlayerId, order: AgentOrder): SubmitResult
resolveRound(state: GameState): { state: GameState; log: ResolutionEvent[] }
projectView(state: GameState, playerId: PlayerId): PlayerView
```

An `AgentOrder` is `{ agentId, actions, buySilencers? }` — a player with two
agents submits two of them, and the round closes when every agent has committed.

Two API details worth knowing before you touch anything:

- **`viewForOrdering(state, player, agentId)`, not `projectView`, when picking
  actions.** A player's agents share one Intel pool, so agent two must see what
  agent one already committed. Using `projectView` here produces orders that
  pass legality checks individually and overspend together.
- **Movement is declared before operations.** `legalOrders` stops offering
  MOVE/SPRINT once an operation is in the prefix, because strikes and bribes
  resolve from the post-movement node — a strike chosen first would silently go
  out of range when a move was added after it. Safehouses, ambushes, and decoys
  resolve pre-movement and are therefore placed from the start node.

Both the PartyKit room (authoritatively) and the browser (for legality previews only) import this package. Same code, same answers — that's the whole reason the project is in TypeScript.

## Non-negotiable constraints

1. **Pure.** No `Math.random()`, no `Date.now()`, no fetch, no console, no filesystem. Randomness comes from the seeded PRNG carried inside `GameState`; anything time-based enters as an explicit order from the caller.
2. **Deterministic.** `(seed, config, ordered Orders)` fully reconstructs a match. Golden replay tests depend on this and so do bug reports.
3. **Immutable.** `resolveRound` deep-clones and returns new state, so the caller keeps the old one to animate the transition. It uses `structuredClone` rather than Immer — `GameState` is plain data, the clone is sub-millisecond at this size, and it removes a dependency from the package with the strictest purity rules.
4. **Total.** Illegal orders return a state carrying a rejection; they don't throw. Exceptions mean a bug, never a rule violation.
5. **Framework-free.** No React, no Next.js, no PartyKit imports. It must run in a bare Node loop.

## `projectView` is a security boundary

It is the only sanctioned way for state to leave this package toward a client. Changes to it get reviewed as security changes, and `tests/` has a leak scan that fails the build if any serialized `PlayerView` contains an opponent's node id.

## Layout

```
src/content/     Cards, maps, rulesets — data, not logic
src/resolution/  The eleven-step round pipeline
src/fog/         View projection and signal generation
tests/           Unit, golden replay, fog leak, property tests
```

See `docs/GAME_DESIGN.md` for the rules this implements and `docs/ARCHITECTURE.md` §4 for the contract.

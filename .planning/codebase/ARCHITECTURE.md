<!-- refreshed: 2026-08-18 -->
# Architecture

**Analysis Date:** 2026-08-18

## System Overview

Berlin 1988 is a 1–4 player hidden-information Cold War game with three core subsystems: a **pure rules engine** (`@berlin/engine`), a **particle-filter-based AI** (`@berlin/ai`), and a web-based **multiplayer UI** (Next.js, PartyKit). The engine runs in two places — browser (predictive) and server (authoritative) — and is the same code in both, guaranteeing consistency.

```text
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER (apps/web)                                                  │
│                                                                      │
│   Next.js client + @berlin/engine (predictive only)                  │
│    ├─ SVG board, order composer, resolution replay                   │
│    ├─ holds ONLY a PlayerView — never full GameState                 │
│    └─ imports engine for legal-order preview, Intel cost preview     │
│         (never authoritative)                                         │
└────────────┬─────────────────────────────────┬───────────────────────┘
             │ WebSocket (orders/views)        │ HTTPS (lobby, auth)
             ▼                                 ▼
┌────────────────────────────────┐  ┌──────────────────────────────────┐
│  PARTYKIT ROOM (apps/party)    │  │  NEXT.JS SERVER (apps/web)       │
│  1 Durable Object per match    │  │  RSC pages, route handlers       │
│                                │  │  matchmaking, profiles (Phase 6) │
│  ┌──────────────────────────┐  │  └────────────┬─────────────────────┘
│  │ AUTHORITATIVE GameState  │  │               │
│  │ @berlin/engine           │  │               ▼
│  │ @berlin/ai (bot seats)   │  │  ┌──────────────────────────────────┐
│  │ projectView() → view     │  │  │  Neon Postgres (Phase 6+)        │
│  └──────────────────────────┘  │  │  matches, users, replays         │
└────────────────────────────────┘  └──────────────────────────────────┘
```

**Core invariant:** The full `GameState` exists in exactly one place — inside the PartyKit room. Everything sent to a client goes through `projectView()`.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Rules Engine** | Pure-function implementation of simultaneous-turn resolution, movement, strikes, traps, dossiers, extraction | `packages/engine/src/` |
| **AI Opponents** | Particle filter + threat inference + feature scoring; five personalities, four difficulty tiers | `packages/ai/src/` |
| **Shared Types** | Domain types, wire protocol schemas, fog boundary types (`PlayerView`, `GameState`) | `packages/shared/src/` |
| **Next.js App** | Board UI, order composer, replay animator, lobby, matchmaking | `apps/web/` |
| **PartyKit Room** | Authoritative match host, lobby state, round clock, bot AI runner, fog projection | `apps/party/src/` |

## Pattern Overview

**Overall:** Layered, deterministic, fog-of-war bounded.

**Key Characteristics:**
- **Purity by layer:** `packages/` contains zero I/O, no randomness outside the seeded PRNG, no network calls. All side effects live in `apps/`.
- **Type-safe fog boundary:** `PlayerView` is a TypeScript type that physically cannot hold opponent positions, safehouses, or active traps. No field exists for them.
- **Determinism from seed:** `(seed, config, ordered Orders)` fully reconstructs any match. No `Math.random()`, no `Date.now()` below `apps/`.
- **One-way dependency flow:** `shared ← engine ← ai ← apps`. Enforced by lint rule. `engine` importing from `ai` is a build error.

## Layers

**Shared Types (`packages/shared`):**
- Purpose: Domain vocabulary, wire protocol, fog boundary definition
- Location: `packages/shared/src/`
- Contains: Branded id types, enums, `GameState`/`PlayerView` interfaces, action unions, `ResolutionEvent`, Zod schemas
- Depends on: Zod (validation only)
- Used by: Everything

**Rules Engine (`packages/engine`):**
- Purpose: Pure implementation of game rules — match creation, order validation, simultaneous round resolution
- Location: `packages/engine/src/`
- Contains: 
  - `createMatch()` — lobby → game state
  - `legalOrders()` — enumerate legal actions from a `PlayerView`
  - `submitOrder()` — validate and record one agent's order
  - `resolveRound()` — eleven-step priority pipeline
  - `projectView()` — security boundary; state → fog-filtered view
  - `rng.ts` — seeded PRNG (xoshiro128** or similar)
  - `resolution/` — 11 modules, one per resolution step
  - `fog/` — view projection and signal generation
  - `content/` — maps, cards, rulesets as data
- Depends on: `@berlin/shared`
- Used by: Both `apps/web` (predictive) and `apps/party` (authoritative)

**AI Opponents (`packages/ai`):**
- Purpose: Bot decision-making — particle filter inference → threat map → feature scoring → action selection
- Location: `packages/ai/src/`
- Contains:
  - `belief.ts` — particle filter over opponent positions (256 particles, `expectimax` inference)
  - `threatMap.ts` — coarser inference layer (trap risk, safehouse risk, blockade risk)
  - `evidence.ts` — signal → particle reweighting
  - `features.ts` — 10+ feature extractors (kill probability, trap value, survival risk, etc.)
  - `scoring.ts` — weighted sum against personality vector
  - `select.ts` — softmax at difficulty temperature + blunder roll
  - `personalities/` — five weight vectors (Butcher, Handler, Infiltrator, Sable, Spymaster)
  - `loadout.ts` — build a 10-card deck per personality
  - `agent.ts` — per-match belief state holder
- Depends on: `@berlin/shared`, `@berlin/engine`
- Used by: `apps/party` only (for bot seats)

**Next.js App (`apps/web`):**
- Purpose: Browser UI — board rendering, order composer, replay animator, lobby
- Location: `apps/web/`
- Contains:
  - `app/` — routes (App Router), RSC for menus, client components for board
  - `components/` — React components (board, order UI, signals panel, replay)
  - `lib/` — client plumbing (socket connection, Zustand store, hooks, formatting)
- Depends on: `@berlin/shared`, `@berlin/engine` (predictive only), React, Tailwind, Motion, PartySocket
- Used by: Browser clients

**PartyKit Room (`apps/party`):**
- Purpose: Authoritative match server — game state ownership, lobby, bot runner, fog projection, round clock
- Location: `apps/party/src/`
- Contains: (skeleton; implementation Phase 2)
  - Match state holder
  - Order validation and commitment logic
  - Round resolution orchestration
  - Bot decision runner (calls `@berlin/ai`)
  - Projection and broadcast (`projectView` for each seat)
  - Clock and pause polling
  - Reconnection handling
- Depends on: `@berlin/shared`, `@berlin/engine`, `@berlin/ai`, PartyKit framework
- Used by: Next.js app via WebSocket

## Data Flow

### Primary Request Path: Order Submission

1. User selects action in order composer (`apps/web/components/board/composer`)
2. Client calls `legalOrders(view, agentId)` from `@berlin/engine` → greyed-out affordances, Intel preview
3. User commits with "SUBMIT" button
4. `apps/web` sends `SUBMIT_ORDER` message (Zod-validated)
5. `apps/party` receives, calls `submitOrder(state, playerId, order)` from engine
6. Engine validates against full `GameState`, accepts or rejects
7. If two agents: player sends second `SUBMIT_ORDER` message
8. When all players committed OR deadline expires: `apps/party` calls `resolveRound()`
9. Engine returns new state + `ResolutionEvent[]` log (fog-unfiltered)
10. Room calls `projectView(state, playerId)` for each seat → one `PlayerView` per player
11. Room broadcasts `ROUND_RESOLVED` with seat's own `PlayerView` + `ResolutionEvent[]`
12. Client receives, updates Zustand store, animates replay from event log

### Bot Decision Flow

1. Round deadline passes or all humans committed
2. For each bot seat:
   - `apps/party` calls `projectView(state, botSeat.id)` → one `PlayerView`
   - Passes `PlayerView` + agent id to `@berlin/ai` agent instance
   - Bot's belief filter updates from signals in the view
   - Bot scores all legal orders from `legalOrders(view, agentId)`
   - Bot selects via softmax sampling at difficulty temp
   - Bot returns `[Action, Action]` (or longer if ambush)
   - Room calls `submitOrder(state, botSeat.id, order)`
   - Bot latency padded 1.5–4s so "thinking" doesn't leak difficulty

### State Management

- **Server:** Full `GameState` held in PartyKit room, immutable after each round
- **Browser:** Only current `PlayerView` held in Zustand store
- **Engine:** Randomness threaded through `GameState` via seeded PRNG (`state.rng`)
- **AI:** Belief state (particle distribution) held on agent instance, persists across rounds within a match

## Key Abstractions

**GameState:**
- Purpose: Complete immutable snapshot of match state
- Examples: `packages/shared/src/state.ts` interface
- Pattern: Plain data object (no methods); mutations via `structuredClone` + modifications

**PlayerView:**
- Purpose: Fog-of-war boundary; what one player is entitled to see
- Examples: `packages/shared/src/view.ts` interface
- Pattern: No fields for opponent positions, safehouses, traps, or cooldowns. Cannot be constructed with forbidden data.
- Security: Only output of `projectView()`, never constructed manually

**Action & Orders:**
- Purpose: Atomic moves and player decisions
- Examples: `MOVE`, `STRIKE`, `HOLD`, `SCAN`, `BRIBE`, `SPRINT`, etc.
- Pattern: Union type per action kind, discriminated by `type` field
- Validation: `legalOrders()` enumerates legal actions; `submitOrder()` validates against full state

**ResolutionEvent:**
- Purpose: Immutable log of what happened in a round, fog-filtered before sending to clients
- Examples: `AGENT_MOVED`, `STRIKE_FIRED`, `DOSSIER_TAKEN`, `AGENT_BURNED`, etc.
- Pattern: Union type, emitted in fixed priority order (11 steps)
- Fog-filtering: Each event carries full data (e.g., strike node, agent identity); `projectView()` redacts before client sees it

**Belief & ThreatMap:**
- Purpose: Bot's internal state; particles over opponent positions, inference over trap/safehouse locations
- Examples: `packages/ai/src/belief.ts`, `packages/ai/src/threatMap.ts`
- Pattern: Immutable snapshots; updated after each signal
- Non-authoritative: Bot's belief can be wrong (decoys fool it, traps surprise it); that's not a bug

## Entry Points

**Browser:**
- Location: `apps/web/app/` (Next.js App Router)
- Triggers: User navigates to Vercel domain
- Responsibilities: Render lobby, join match, display board, send/receive via WebSocket

**PartyKit Room:**
- Location: `apps/party/src/` (skeleton)
- Triggers: Client sends `JOIN` message with match id
- Responsibilities: Load or create match state, run game loop, broadcast views, run bots, handle pause/reconnect

**Order Submission (Server-side):**
- Location: `apps/party/src/` message handler
- Triggers: Client sends `SUBMIT_ORDER`
- Responsibilities: Validate, record, check if all committed, call `resolveRound()`

**Round Resolution:**
- Location: `packages/engine/src/resolution/index.ts`
- Triggers: All agents committed OR deadline
- Responsibilities: Run 11-step pipeline, emit event log, return new state

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js + browser). Durable Object runs single-threaded per match (no concurrency, strict FIFO ordering).
- **Global state:** `GameState` is the only mutable global. Held in PartyKit room. Engine receives via parameter, returns new copy (immutable).
- **Circular imports:** None — one-way dependency flow enforced by lint rule.
- **Determinism:** No `Math.random()` anywhere in `packages/`. All randomness from seeded PRNG in `GameState.rng`. Consequence: same seed + same orders = byte-identical replay.
- **Fog enforcement:** Type system forbids constructing a `PlayerView` with opponent hidden state. Cannot accidentally leak.
- **Pure functions:** Engine is pure. No side effects on `GameState` — all mutations are immutable (clone-modify-return).

## Anti-Patterns

### Accessing GameState from a Client Component

**What happens:** Component imports full `GameState` type or receives it via props, granting access to opponent positions/safehouses/traps.

**Why it's wrong:** Breaks fog-of-war at the type boundary. Makes security depend on convention (never access this field) instead of structure (field doesn't exist).

**Do this instead:** 
- Receive only `PlayerView` in client components (`apps/web/components/`).
- If you need opponent data not in the view, either:
  - Add it to `OpponentPublicInfo` (review as security change), or
  - Realize the player isn't entitled to it and don't show it.

**Reference:** `apps/web/CLAUDE.md` rule 1, `docs/ARCHITECTURE.md` §4.1

### Calling Math.random() or Date.now() in packages/

**What happens:** Non-deterministic value sneaks into engine, breaks replays, makes bug reports unreproducible.

**Why it's wrong:** Engine is tested via `(seed, config, orders) → state` equivalence. `Math.random()` means same inputs produce different outputs. Defeats determinism and replay testing.

**Do this instead:**
- All randomness uses `state.rng` (seeded PRNG). Thread it through functions.
- Time-based actions (deadlines, auto-hold) live in room server and enter as explicit `TimeoutOrder`.

**Reference:** `packages/engine/CLAUDE.md` constraint 1

### Using Features Before All Signals Are Processed

**What happens:** AI bot extracts a feature (e.g., "trap at node X") before the belief filter has been updated with new signals, leading to stale inference.

**Why it's wrong:** Bot's decisions can be needlessly surprised in later rounds. Belief state inconsistency.

**Do this instead:**
- Bot's `decide()` receives `PlayerView` which includes the latest `signals`.
- First update belief from signals (in `evidence.ts`).
- Then extract features (in `features.ts`).
- Then score and select.

**Reference:** `packages/ai/src/agent.ts` orchestrates the order.

### Reordering the Eleven Resolution Steps

**What happens:** Step 6 (blockades) runs before step 4 (movement) to "make it cleaner", then a bug appears where an agent moves into a blockaded node and isn't caught.

**Why it's wrong:** The order is a game-design decision, not an implementation convenience. It defines the skill ceiling (move, *then* predict strikes vs. you). Reordering changes the game.

**Do this instead:**
- The order is in `docs/GAME_DESIGN.md` §7.2 and must match `packages/engine/src/resolution/index.ts` exactly.
- If the order feels wrong, change the design doc first, then the code.

**Reference:** `packages/engine/src/resolution/index.ts` comment at line 23–26

## Error Handling

**Strategy:** No exceptions for rules violations; only for bugs.

**Patterns:**
- `submitOrder()` returns `SubmitResult`, which carries an accepted state or a rejection. Illegal orders don't throw.
- `legalOrders()` returns empty array if no moves are legal (e.g., dead agent).
- Engine queries return `null` or `undefined` if the target doesn't exist; no "not found" exception.
- Room server catches errors and returns `ERROR` message to client (never crashes the match).

**Why:** A hidden-information game has many edge cases. Exceptions should mean bugs (invariant violated), not rules (player made an illegal move). Separating them keeps debugging tractable.

## Cross-Cutting Concerns

**Logging:** None in `packages/`. Room server logs significant events (player joined, round resolved, match ended) for debugging and replay inspection. Client-side logging only for network issues.

**Validation:** Zod schemas at every trust boundary. All client→server messages validated before touching the engine. UI uses `legalOrders()` for affordances; server re-checks with full state.

**Authentication:** Stub in Phase 2 (no auth). Phase 6 adds user accounts and profile matching. Token-based, likely via NextAuth or similar.

**Cooldowns:** Per-player, per-card, tracked in `GameState.players[id].cooldowns`. Shared across a player's two agents (if any). Ticked down after each round in `upkeep()`.

**Intel & Budget:** Player-level resource. Actions draw from it; `HOLD` and income restore it. `legalOrders()` respects budget. Budget overflow is prevented (capped at max).

---

*Architecture analysis: 2026-08-18*

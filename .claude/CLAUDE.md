<!-- GSD:project-start source:PROJECT.md -->

## Project

**Berlin 1988**

A 1–4 player Cold War hidden-movement web game, inspired by the mobile game "Two Spies" but built to support more players (and AI opponents filling any empty seats). Players run 1–2 hidden agents each on a node-graph map of divided Berlin, secretly assigning actions each round, with results resolving simultaneously. Built for a group of friends (or solo vs. bots) to play a full match together in the browser.

**Core Value:** A group of players (any mix of humans and AI) can go from the home page through a lobby into a complete, playable 14-round match and see a result — with no gaps in the underlying rules engine. Everything else (visual polish, extra UI niceties) can slip; this cannot.

### Constraints

- **Tech stack**: TypeScript throughout, strict mode. `apps/web` on Next.js/Vercel; `apps/party` is a PartyKit room server acting as the authoritative match host. — established in ARCHITECTURE.md
- **Dependency direction**: `shared ← engine ← ai ← apps` only; an import going the other direction is a build error. — established rule, CLAUDE.md
- **Engine purity**: no `Math.random()`, `Date.now()`, fetch, or logging below `apps/` — all randomness flows from the seeded PRNG in `GameState`. — established rule, CLAUDE.md
- **Fog of war**: `PlayerView` must never carry another player's agent positions, safehouse, traps, or cooldowns. — established rule, CLAUDE.md
- **Hosting**: `apps/web` deploys to Vercel; where `apps/party` (PartyKit) deploys is undecided — flagged for research before/during the relevant phase.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.7.3 - Full project, `strict: true`. Used across engine, AI, apps, and tests
- JavaScript (ESM modules) - Package format

## Runtime

- Node.js 22+ (from `@types/node@22.20.1`)
- pnpm 9.15.4
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

- Next.js 15, App Router - Web app (`apps/web`), React Server Components + client components
- PartyKit - Realtime authoritative room server (`apps/party`), runs on Cloudflare Durable Objects
- Vitest 2.1.9 - Unit tests, golden replay tests, integration tests
- TypeScript compiler (tsc) - Type checking via `pnpm typecheck`
- tsx 4.23.12 - TypeScript execution for simulation harness (`packages/ai/sim/run.ts`)
- Turborepo - Monorepo task orchestration (referenced in ARCHITECTURE.md)
- Biome - Linting and formatting (referenced in CLAUDE.md, config not yet created)

## Key Dependencies

- None at present. Packages are framework-free and dependency-free to maintain purity.
- **Zod** - Runtime validation at trust boundaries (mentioned in `docs/ARCHITECTURE.md` §1), planned for `packages/shared` schemas
- **Zustand** - Client state management (`apps/web`), holds session/UI concerns only
- **Motion** (framer-motion successor) - Resolution replay animation
- **Tailwind CSS v4** - Styling with design tokens in CSS variables
- **Drizzle ORM** - Database schema migrations and queries (`apps/web` + `apps/party`)
- `@types/node@22.20.1` - TypeScript definitions for Node.js APIs
- `typescript@5.9.3` - TypeScript compiler

## Configuration

- `tsconfig.base.json` - Shared compiler options (`target: ES2022`, `lib: ES2022`, `module: ESNext`, `moduleResolution: Bundler`)
- `tsconfig.json` - Root project references via monorepo workspace (`packages/shared`, `packages/engine`, `packages/ai`)
- Per-package tsconfig files with `composite: true` for incremental builds
- `NEXT_PUBLIC_PARTYKIT_HOST` - Only environment coupling between `apps/web` and `apps/party` (set via Vercel)
- Other environment vars planned for Phase 6+ (Neon Postgres credentials, etc.)
- `pnpm-workspace.yaml` - Monorepo structure (`packages/*`, `apps/*`)
- Root `package.json` - Workspace scripts: `test`, `test:watch`, `typecheck`, `sim`

## Package Structure

- `packages/shared/` - Types, enums, wire-protocol schemas. Zero dependencies. Re-exports via `src/index.ts`
- `packages/engine/` - Pure rules engine. Only depends on `@berlin/shared`. Re-exports via `src/index.ts`
- `packages/ai/` - Bot opponents. Depends on `@berlin/shared`, `@berlin/engine`. Re-exports via `src/index.ts`
- `apps/web/` - Next.js client application (skeleton as of 2026-08-18)
- `apps/party/` - PartyKit room server (skeleton as of 2026-08-18)

## Platform Requirements

- Node.js 22+ with pnpm 9.15.4
- TypeScript 5.7.3
- Biome for linting/formatting (config not yet present; will replace ESLint/Prettier)
- **Web hosting:** Vercel (Next.js 15 App Router)
- **Realtime hosting:** Cloudflare (PartyKit Durable Objects, distributed globally)
- **Database (Phase 6+):** Neon Postgres (serverless PostgreSQL)

## Commands

## Special Notes

- **No Python dependency:** Rules engine implemented in TypeScript, not Python/FastAPI, for code sharing across client/server boundaries
- **Purity constraints:** `packages/engine` and `packages/ai` contain no side effects, randomness, I/O, or framework imports
- **Monorepo with strict boundaries:** Dependency flow is `shared ← engine ← ai ← apps`, enforced by lint
- **Seeded PRNG:** All randomness comes from a seeded PRNG inside `GameState`, enabling deterministic replay and golden-file testing
- **Module resolution:** ESM only, `"type": "module"` in root and all packages, `verbatimModuleSyntax: true` for precise re-exports

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Modules use `camelCase.ts` with descriptive names aligned to their single responsibility
- Examples: `legalOrders.ts`, `threatMap.ts`, `createMatch.ts`, `projectView.ts`
- Test files use `.test.ts` suffix: `rules.test.ts`, `fairness.test.ts`, `determinism.test.ts`
- Content data files in `src/content/` describe their payload: `cards.ts`, `rulesets.ts`, `loadouts.ts`
- `camelCase` for all functions, including factory functions and queries
- Prefix by intent: `create*` (constructors), `is*` (predicates), `get*` (accessors), `has*` (existence checks), `validate*` (validation)
- Examples: `createMatch()`, `legalOrders()`, `projectView()`, `isReady()`, `hasPassive()`, `nodeOf()`, `distance()`, `seedRng()`
- Private methods use same case in class implementations
- `camelCase` for all local variables and parameters
- Private class fields prefixed with `private readonly` or `private` keyword
- Examples: `const threat = createThreatMap()`, `let belief: Belief | null = null`, `private rng: RngState`
- Constants that are computed values stay `camelCase` (not `SCREAMING_SNAKE_CASE`)
- `PascalCase` for all type names, interfaces, and classes
- Branded id types with `Brand<T, B>` pattern: `PlayerId`, `AgentId`, `NodeId`, `CardId`, `MatchId`
- Examples: `PlayerView`, `GameState`, `AIAgent`, `ThreatMap`, `Personality`, `DifficultyTier`
- Use `type` for unions and readonly value types, `interface` for object shapes

## Code Style

- TypeScript strict mode with `strict: true` in `tsconfig.base.json`
- Additional strictness settings: `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`
- Target ES2022, module resolution 'Bundler'
- Use `verbatimModuleSyntax: true` for explicit type imports
- No explicit linter config detected; rely on TypeScript compiler strictness
- No ESLint or Biome config found; project relies on TypeScript strict compiler checks
- Lint rule bans `Math.random()` anywhere in `packages/engine` — all randomness must flow through seeded PRNG in `GameState`
- Type safety is enforced at compile time: using `PlayerId` where `NodeId` expected is a compiler error

## Import Organization

- **Forbidden:** never import from `packages/*/src/file.ts` directly
- **Required:** import only through barrel exports: `import { X } from '@berlin/package'`
- This is enforced as a build error, not a style preference

## Error Handling

- **Throws only for programmer errors** — functions that should never fail given correct usage throw `Error`
- **Returns empty/null for expected edge cases** — guards and early returns handle preconditions
- **No exceptions for rule violations** — `submitOrder()` returns a `SubmitResult` with rejection details, never throws
- Guard clauses at function start for illegal inputs (null checks, alive checks, phase checks)
- Example from `legalOrders.ts`: `if (!a || !a.alive || self.eliminated) return [];`
- Validation functions like `validateLoadout()` check constraints and return boolean or details
- Game-state validity checks in resolution pipeline return events with failure information, not exceptions
- Throws when internal invariants break: `const n = map.nodes.find(...); if (!n) throw new Error(...)`

## Logging

- `packages/engine`, `packages/shared`, `packages/ai` contain **zero logging** — these are pure libraries
- Logging only appropriate at application boundary (`apps/` layer)
- Simulation harness in `packages/ai/sim/run.ts` uses console for match metrics and reports
- All observable information must flow through return values and `ResolutionEvent[]` log, never side-effect logging

## Comments

- **Document the "why", not the "what"** — code structure should make the what obvious
- Comments explain intent, constraints, and non-obvious reasoning
- Every public function or complex feature gets a JSDoc block
- Complex algorithms get inline comments explaining the approach
- All exported functions and types receive JSDoc: `/** ... */` blocks above definitions
- Describe parameters, return values, and side-effects (especially "pure" claims and immutability)
- Example from `agent.ts`:
- Use `//` comments for complex decision points and non-obvious logic flow
- Example from `agent.ts` explaining `predicted` field:
- Comment blocks explaining game-design-driven decisions, not implementation details

## Function Design

- Prefer small, single-responsibility functions (~10-30 lines typical)
- Resolution pipeline in `packages/engine/src/resolution/` kept as separate modules for clarity
- Complex orchestration (like `Bot.decide()`) kept in one place but broken into clear stages (believe → score → choose)
- Favor named parameters over positional when function has 3+ parameters
- Prefix optional parameters with `prefix` or suffix with optional flag when order matters
- Example: `legalOrders(view: PlayerView, agent: AgentId, prefix: readonly Action[] = [])`
- Query functions take their subject as first parameter: `distance(map, from, to)`, `nodeOf(map, id)`
- Return empty collections over null when the "nothing" case is expected
- Return specific types to enforce compile-time constraints: `PlayerId` not `string`
- Immutable data structures: functions return new objects, never mutate inputs
- Example: `resolveRound()` returns `{ state: GameState; log: ResolutionEvent[] }`, a new `GameState` not a mutation
- Type signatures themselves document contracts: `(view: PlayerView, agentId: AgentId): Action[]` tells the AI it receives only what a human sees
- Branded types prevent id mixing at compile time: impossible to pass a `NodeId` to a function expecting `PlayerId`

## Module Design

- Every package exports exactly one public surface: `src/index.ts`
- Only functions and types listed in `src/index.ts` are part of the public contract
- Implementation files (e.g., `belief.ts`, `threatMap.ts`) are internal and not re-exported
- This enforces the dependency direction: `shared ← engine ← ai`
- `src/index.ts` is the only barrel export
- Export both types and implementations needed by consumers
- Example from `packages/engine/src/index.ts`:
- Zero initialization code that runs when the module is first imported
- No module-level `Math.random()` or `Date.now()` calls
- Randomness initialized via explicit function: `seedRng(seed)` returns an `RngState`
- This allows packages to be imported by simulation loops and CI without triggering side effects
- `packages/engine` must be pure: no fetch, no filesystem, no console, no mutations
- `packages/shared` is pure: types and tiny helper functions only
- `packages/ai` is pure in decision: `decide()` is deterministic under seed; belief state held on instance
- Impurity allowed only at app boundary (`apps/`) for I/O and UI

## TypeScript-Specific Conventions

- Use `type` for branded ids, unions, and value types: `type PlayerId = Brand<string, 'PlayerId'>`
- Use `interface` for object shapes that represent data structures: `interface PlayerView { ... }`
- Interfaces are preferred for public APIs when the shape may be extended
- Keep generic parameter names short and conventional: `T`, `K`, `V`
- Generic constraints should document intent: `<T extends NodeId>` is clearer than `T`
- All functions must have explicit return type annotations on exported functions
- Index access checked: `map.nodes[i]` may be undefined, use `?.` or find
- Switch statements must have default case or `noFallthroughCasesInSwitch` enforces exhaustiveness

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Rules Engine** | Pure-function implementation of simultaneous-turn resolution, movement, strikes, traps, dossiers, extraction | `packages/engine/src/` |
| **AI Opponents** | Particle filter + threat inference + feature scoring; five personalities, four difficulty tiers | `packages/ai/src/` |
| **Shared Types** | Domain types, wire protocol schemas, fog boundary types (`PlayerView`, `GameState`) | `packages/shared/src/` |
| **Next.js App** | Board UI, order composer, replay animator, lobby, matchmaking | `apps/web/` |
| **PartyKit Room** | Authoritative match host, lobby state, round clock, bot AI runner, fog projection | `apps/party/src/` |

## Pattern Overview

- **Purity by layer:** `packages/` contains zero I/O, no randomness outside the seeded PRNG, no network calls. All side effects live in `apps/`.
- **Type-safe fog boundary:** `PlayerView` is a TypeScript type that physically cannot hold opponent positions, safehouses, or active traps. No field exists for them.
- **Determinism from seed:** `(seed, config, ordered Orders)` fully reconstructs any match. No `Math.random()`, no `Date.now()` below `apps/`.
- **One-way dependency flow:** `shared ← engine ← ai ← apps`. Enforced by lint rule. `engine` importing from `ai` is a build error.

## Layers

- Purpose: Domain vocabulary, wire protocol, fog boundary definition
- Location: `packages/shared/src/`
- Contains: Branded id types, enums, `GameState`/`PlayerView` interfaces, action unions, `ResolutionEvent`, Zod schemas
- Depends on: Zod (validation only)
- Used by: Everything
- Purpose: Pure implementation of game rules — match creation, order validation, simultaneous round resolution
- Location: `packages/engine/src/`
- Contains: 
- Depends on: `@berlin/shared`
- Used by: Both `apps/web` (predictive) and `apps/party` (authoritative)
- Purpose: Bot decision-making — particle filter inference → threat map → feature scoring → action selection
- Location: `packages/ai/src/`
- Contains:
- Depends on: `@berlin/shared`, `@berlin/engine`
- Used by: `apps/party` only (for bot seats)
- Purpose: Browser UI — board rendering, order composer, replay animator, lobby
- Location: `apps/web/`
- Contains:
- Depends on: `@berlin/shared`, `@berlin/engine` (predictive only), React, Tailwind, Motion, PartySocket
- Used by: Browser clients
- Purpose: Authoritative match server — game state ownership, lobby, bot runner, fog projection, round clock
- Location: `apps/party/src/`
- Contains: (skeleton; implementation Phase 2)
- Depends on: `@berlin/shared`, `@berlin/engine`, `@berlin/ai`, PartyKit framework
- Used by: Next.js app via WebSocket

## Data Flow

### Primary Request Path: Order Submission

### Bot Decision Flow

### State Management

- **Server:** Full `GameState` held in PartyKit room, immutable after each round
- **Browser:** Only current `PlayerView` held in Zustand store
- **Engine:** Randomness threaded through `GameState` via seeded PRNG (`state.rng`)
- **AI:** Belief state (particle distribution) held on agent instance, persists across rounds within a match

## Key Abstractions

- Purpose: Complete immutable snapshot of match state
- Examples: `packages/shared/src/state.ts` interface
- Pattern: Plain data object (no methods); mutations via `structuredClone` + modifications
- Purpose: Fog-of-war boundary; what one player is entitled to see
- Examples: `packages/shared/src/view.ts` interface
- Pattern: No fields for opponent positions, safehouses, traps, or cooldowns. Cannot be constructed with forbidden data.
- Security: Only output of `projectView()`, never constructed manually
- Purpose: Atomic moves and player decisions
- Examples: `MOVE`, `STRIKE`, `HOLD`, `SCAN`, `BRIBE`, `SPRINT`, etc.
- Pattern: Union type per action kind, discriminated by `type` field
- Validation: `legalOrders()` enumerates legal actions; `submitOrder()` validates against full state
- Purpose: Immutable log of what happened in a round, fog-filtered before sending to clients
- Examples: `AGENT_MOVED`, `STRIKE_FIRED`, `DOSSIER_TAKEN`, `AGENT_BURNED`, etc.
- Pattern: Union type, emitted in fixed priority order (11 steps)
- Fog-filtering: Each event carries full data (e.g., strike node, agent identity); `projectView()` redacts before client sees it
- Purpose: Bot's internal state; particles over opponent positions, inference over trap/safehouse locations
- Examples: `packages/ai/src/belief.ts`, `packages/ai/src/threatMap.ts`
- Pattern: Immutable snapshots; updated after each signal
- Non-authoritative: Bot's belief can be wrong (decoys fool it, traps surprise it); that's not a bug

## Entry Points

- Location: `apps/web/app/` (Next.js App Router)
- Triggers: User navigates to Vercel domain
- Responsibilities: Render lobby, join match, display board, send/receive via WebSocket
- Location: `apps/party/src/` (skeleton)
- Triggers: Client sends `JOIN` message with match id
- Responsibilities: Load or create match state, run game loop, broadcast views, run bots, handle pause/reconnect
- Location: `apps/party/src/` message handler
- Triggers: Client sends `SUBMIT_ORDER`
- Responsibilities: Validate, record, check if all committed, call `resolveRound()`
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

- Receive only `PlayerView` in client components (`apps/web/components/`).
- If you need opponent data not in the view, either:

### Calling Math.random() or Date.now() in packages/

- All randomness uses `state.rng` (seeded PRNG). Thread it through functions.
- Time-based actions (deadlines, auto-hold) live in room server and enter as explicit `TimeoutOrder`.

### Using Features Before All Signals Are Processed

- Bot's `decide()` receives `PlayerView` which includes the latest `signals`.
- First update belief from signals (in `evidence.ts`).
- Then extract features (in `features.ts`).
- Then score and select.

### Reordering the Eleven Resolution Steps

- The order is in `docs/GAME_DESIGN.md` §7.2 and must match `packages/engine/src/resolution/index.ts` exactly.
- If the order feels wrong, change the design doc first, then the code.

## Error Handling

- `submitOrder()` returns `SubmitResult`, which carries an accepted state or a rejection. Illegal orders don't throw.
- `legalOrders()` returns empty array if no moves are legal (e.g., dead agent).
- Engine queries return `null` or `undefined` if the target doesn't exist; no "not found" exception.
- Room server catches errors and returns `ERROR` message to client (never crashes the match).

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

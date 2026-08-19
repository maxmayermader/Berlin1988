# Codebase Structure

**Analysis Date:** 2026-08-18

## Directory Layout

```
berlin1988/
├── .planning/
│   └── codebase/         # (Generated) Architecture docs, analysis
├── .vscode/              # Editor settings
├── docs/
│   ├── GAME_DESIGN.md    # Complete rules; start here
│   ├── ARCHITECTURE.md   # Tech stack, boundaries, protocol
│   ├── AI_OPPONENTS.md   # Bot design, personalities, validation gates
│   └── CLAUDE.md         # Doc directory guidelines
├── packages/
│   ├── shared/           # Types, wire protocol (zero dependencies)
│   │   ├── src/
│   │   │   ├── ids.ts                # Branded id types (PlayerId, NodeId, etc.)
│   │   │   ├── enums.ts              # Sector, Phase, Difficulty, etc.
│   │   │   ├── cards.ts              # Card definitions, loadout constraints
│   │   │   ├── map.ts                # NodeState, Edge, MapDefinition
│   │   │   ├── state.ts              # GameState, PlayerSecrets (server-only)
│   │   │   ├── view.ts               # PlayerView, OpponentPublicInfo (fog boundary)
│   │   │   ├── orders.ts             # Action, Order, ResolutionEvent unions
│   │   │   ├── settings.ts           # MatchSettings (host options)
│   │   │   ├── protocol.ts           # Zod schemas for wire messages
│   │   │   ├── ruleset.ts            # 🔧 tunable numbers as one object
│   │   │   ├── index.ts              # Public barrel
│   │   │   └── CLAUDE.md             # Package guidelines
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tests/                    # (None yet; types-only package)
│   │
│   ├── engine/           # Pure rules engine (no I/O, no React)
│   │   ├── src/
│   │   │   ├── index.ts              # Public API barrel (5 functions)
│   │   │   ├── createMatch.ts        # Lobby → GameState initialization
│   │   │   ├── legalOrders.ts        # Enumerate legal actions from PlayerView
│   │   │   ├── submitOrder.ts        # Validate and record one agent's order
│   │   │   ├── resolveRound.ts       # NOT in src/; in resolution/index.ts
│   │   │   ├── projectView.ts        # NOT in src/; in fog/projectView.ts (security boundary)
│   │   │   ├── rng.ts                # Seeded PRNG (xoshiro128**)
│   │   │   ├── graph.ts              # Map queries (adjacency, distance, reachability)
│   │   │   ├── cooldowns.ts          # Per-card, per-player cooldown state
│   │   │   ├── victory.ts            # Victory checks (extraction, elimination, score)
│   │   │   ├── loadout.ts            # Loadout validation, budget, passives
│   │   │   ├── passives.ts           # Passive card helpers
│   │   │   ├── actionBudget.ts       # Action slot accounting
│   │   │   ├── costs.ts              # Intel costs for actions
│   │   │   │
│   │   │   ├── content/              # Data files (cards, maps, rulesets)
│   │   │   │   ├── index.ts          # Public barrel
│   │   │   │   ├── cards.ts          # All 40 cards
│   │   │   │   ├── loadouts.ts       # Four starter decks
│   │   │   │   ├── rulesets.ts       # Base ruleset object (🔧 tuning)
│   │   │   │   └── maps/
│   │   │   │       └── duel12.ts     # 12-node duel map
│   │   │   │
│   │   │   ├── resolution/           # Eleven-step round pipeline
│   │   │   │   ├── index.ts          # Compose steps, emit events
│   │   │   │   ├── ctx.ts            # RoundContext (state + event emitter)
│   │   │   │   ├── arm.ts            # Step 1: safehouses, silencers
│   │   │   │   ├── traps.ts          # Step 2: ambushes set
│   │   │   │   ├── decoys.ts         # Step 3: decoys placed
│   │   │   │   ├── movement.ts       # Step 4: all agents move
│   │   │   │   ├── trapTriggers.ts   # Step 5: trap activation, Dead Drop
│   │   │   │   ├── blockades.ts      # Step 6: node closures, sheltering
│   │   │   │   ├── bribes.ts         # Step 7: informant captures
│   │   │   │   ├── wiretaps.ts       # Step 8: scans (from post-move pos)
│   │   │   │   ├── strikes.ts        # Step 9: strike resolution
│   │   │   │   ├── contested.ts      # Step 10: the ladder (traps → safehouse → roll → K9)
│   │   │   │   └── objectives.ts     # Step 11: dossier pickup, extraction
│   │   │   │
│   │   │   └── fog/                  # Fog-of-war projection
│   │   │       ├── projectView.ts    # SECURITY BOUNDARY: GameState → PlayerView
│   │   │       ├── signals.ts        # Generate Signal[] from ResolutionEvent[]
│   │   │       ├── filterEvents.ts   # Graded redaction per signal type
│   │   │       ├── strikeNoise.ts    # Strike precision (exact → sector → silent)
│   │   │       └── visibility.ts     # Which nodes a player can "see"
│   │   │
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── CLAUDE.md
│   │   └── tests/
│   │       ├── rules.test.ts         # Per-operation unit tests
│   │       ├── golden.test.ts        # Replay fixtures (byte-identical regression)
│   │       ├── fog-leak.test.ts      # Security: no opponent data in PlayerView
│   │       ├── determinism.test.ts   # Order-of-submission doesn't affect outcome
│   │       ├── contested.test.ts     # All branches of the contested ladder
│   │       ├── soak.test.ts          # Elimination integrity, orphaned state
│   │       ├── scenario.ts           # Test setup helpers (create match with specific agents/nodes)
│   │       └── helpers.ts            # Assertion helpers
│   │
│   └── ai/               # Bot opponents (five personalities, four tiers)
│       ├── src/
│       │   ├── index.ts              # Public barrel (createAgent, AIAgent interface)
│       │   ├── agent.ts              # Per-match belief holder, orchestrates pipeline
│       │   ├── belief.ts             # Particle filter (256 particles) over positions
│       │   ├── threatMap.ts          # Trap/safehouse/blockade risk inference
│       │   ├── evidence.ts           # Signal → particle reweighting (Bayes update)
│       │   ├── features.ts           # Feature extractors (10+ features per move)
│       │   ├── scoring.ts            # Weighted feature sum per personality
│       │   ├── select.ts             # Softmax sampling + blunder roll
│       │   ├── difficulty.ts         # Four tiers as parameter sets
│       │   ├── jointPlan.ts          # Score 1–2 agents together (avoid convergence)
│       │   ├── loadout.ts            # Build personality-matched 10-card deck
│       │   ├── lookahead.ts          # 2–3 ply search for high tiers
│       │   ├── habits.ts             # Opponent action histogram (Sable adaptive model)
│       │   └── personalities/
│       │       ├── index.ts          # Export all five personalities + weights
│       │       └── (personality data)
│       │
│       ├── package.json
│       ├── tsconfig.json
│       ├── CLAUDE.md
│       ├── tests/
│       │   ├── (Validation gates, no golden fixtures yet)
│       │   └── helpers.ts
│       │
│       ├── sim/                      # Headless balance harness
│       │   ├── run.ts                # Entry point: `pnpm sim --matches 300 --profile`
│       │   ├── runner.ts             # Bot-vs-bot match loop
│       │   ├── stats.ts              # Win rates, action histograms, balance metrics
│       │   └── profiler.ts           # CPU profiling (p99 latency)
│       │
│       └── CLAUDE.md
│
├── apps/
│   ├── web/              # Next.js app (Phase 2)
│   │   ├── app/          # Routes (App Router)
│   │   │   ├── CLAUDE.md
│   │   │   └── (layout, pages — skeleton)
│   │   │
│   │   ├── components/   # React components
│   │   │   ├── CLAUDE.md
│   │   │   ├── board/    # SVG board, node graphics, edge graphics
│   │   │   ├── (lobby UI, order composer, replay animator — skeleton)
│   │   │   └── CLAUDE.md
│   │   │
│   │   ├── lib/          # Client plumbing
│   │   │   ├── socket.ts         # PartySocket connection manager
│   │   │   ├── store.ts          # Zustand store (UI state: selected agent, pending actions, etc.)
│   │   │   ├── hooks.ts          # Custom React hooks
│   │   │   ├── formatting.ts     # Display helpers (format Intel, node names, etc.)
│   │   │   └── CLAUDE.md
│   │   │
│   │   ├── CLAUDE.md
│   │   ├── package.json  # (None yet; skeleton)
│   │   └── tsconfig.json # (None yet; skeleton)
│   │
│   ├── party/            # PartyKit room server (Phase 2)
│   │   ├── src/          # (Skeleton; implementation pending)
│   │   │   ├── index.ts  # Room class, message handlers
│   │   │   ├── handlers/ # (join, submitOrder, setPause, etc.)
│   │   │   ├── CLAUDE.md
│   │   │   └── helpers.ts
│   │   │
│   │   ├── CLAUDE.md
│   │   ├── package.json  # (None yet; skeleton)
│   │   └── tsconfig.json # (None yet; skeleton)
│   │
│   └── CLAUDE.md
│
├── .eslintrc.json        # (Planned; not yet added)
├── .prettierrc.json      # (Planned; not yet added)
├── biome.json            # (Planned Phase 0; lint + format)
├── tsconfig.json         # Monorepo root (references to packages)
├── tsconfig.base.json    # Shared TypeScript config
├── pnpm-workspace.yaml   # pnpm monorepo config
├── pnpm-lock.yaml        # Dependency lockfile
├── vitest.config.ts      # Test runner config
├── package.json          # Monorepo root (scripts, dev deps)
├── CLAUDE.md             # Project-level guidelines
├── plan.md               # Phased build plan (Phases 0–6)
├── game_specs.md         # Superseded v1 draft (archive)
└── README.md             # (Not yet written)
```

## Directory Purposes

**`docs/`:**
- Purpose: Design documentation — the source of truth for *what* Berlin 1988 is
- Key files: `GAME_DESIGN.md` (complete rules), `ARCHITECTURE.md` (tech decisions), `AI_OPPONENTS.md` (bot design)
- Note: Game-design changes land here first, then in code. Design docs are canonical; code implements them.

**`packages/shared/`:**
- Purpose: Type definitions and wire protocol
- Contains: Branded id types, domain shapes, Zod schemas for all client↔server messages
- Zero dependencies except Zod
- Imports from: Nothing
- Imported by: Everything

**`packages/engine/`:**
- Purpose: Pure game-rules implementation
- Key structure: 
  - `src/index.ts` — five public functions only (createMatch, legalOrders, submitOrder, resolveRound, projectView)
  - `content/` — cards, maps, rulesets as data (configurable, no logic)
  - `resolution/` — eleven modules per pipeline step (one-per-step design, fixed order)
  - `fog/` — security boundary (GameState → PlayerView projection)
- No I/O, no randomness outside seeded PRNG, no React
- Imports from: `@berlin/shared`
- Imported by: Both browser (predictive) and server (authoritative)

**`packages/ai/`:**
- Purpose: Bot opponents (Butcher, Handler, Infiltrator, Sable, Spymaster × four difficulty tiers)
- Key files:
  - `agent.ts` — orchestrates pipeline: belief update → feature extraction → scoring → selection
  - `belief.ts` — particle filter (256 particles over opponent positions)
  - `threatMap.ts` — inference layer (trap/safehouse/blockade risks)
  - `features.ts` — 10+ feature extractors (called per legal order)
  - `scoring.ts` — weighted sum against personality vector
  - `select.ts` — softmax sampling at difficulty temperature
  - `personalities/` — five weight vectors (data)
  - `sim/` — headless balance harness (10k bot-vs-bot matches per ruleset)
- Imports from: `@berlin/shared`, `@berlin/engine`
- Imported by: `apps/party` only

**`apps/web/`:**
- Purpose: Browser UI — board, order composer, replay animator, lobby
- Structure:
  - `app/` — routes (Next.js App Router), RSC for menus, client components for board
  - `components/` — React components (board SVG, UI panels, animations)
  - `lib/` — client plumbing (WebSocket, Zustand store, hooks)
- Holds: Only `PlayerView` (never full `GameState`)
- Imports engine for: Predictive legality checks, Intel cost preview (never authoritative)
- Status: Skeleton (Phase 2)

**`apps/party/`:**
- Purpose: Authoritative match server (one Durable Object per match)
- Responsibilities: GameState ownership, order validation, bot runner, fog projection, clock, reconnection
- Status: Skeleton (Phase 2)

## Key File Locations

**Entry Points:**
- Browser: `apps/web/app/layout.tsx` (Next.js root)
- Server: `apps/party/src/index.ts` (PartyKit room class)
- Tests: `packages/engine/tests/` (Vitest, includes golden fixtures)

**Configuration:**
- TypeScript: `tsconfig.json` (root), `tsconfig.base.json` (shared), per-package `tsconfig.json`
- Monorepo: `pnpm-workspace.yaml`
- Tests: `vitest.config.ts` (aliases, environment)
- Build: `package.json` scripts (test, typecheck, sim)

**Core Logic:**
- Game rules: `packages/engine/src/`
- AI decisions: `packages/ai/src/`
- Types/protocol: `packages/shared/src/`
- Board UI: `apps/web/components/board/`
- Match host: `apps/party/src/`

**Testing:**
- Unit + golden: `packages/engine/tests/`
- AI validation: `packages/ai/tests/` (gates: distinguishability, monotonicity, exploitability, speed)
- E2E: `apps/web/tests/` (Playwright, Phase 2)
- Balance: `packages/ai/sim/` (10k matches, action histograms, win rates)

## Naming Conventions

**Files:**
- TypeScript modules: `camelCase.ts` (e.g., `createMatch.ts`, `projectView.ts`)
- Components: `PascalCase.tsx` (e.g., `OrderComposer.tsx`, `ResolutionReplay.tsx`)
- Test files: `*.test.ts` or `*.spec.ts` (e.g., `rules.test.ts`, `fog-leak.test.ts`)
- Data files: `camelCase.ts` (e.g., `cards.ts`, `rulesets.ts`)

**Directories:**
- Feature areas: `camelCase/` (e.g., `resolution/`, `personalities/`)
- Component containers: `PascalCase/` (e.g., `OrderComposer/`, `ResolutionReplay/`)
- Reusable folders: `lowercase/` (e.g., `lib/`, `components/`, `src/`)

**Types & Interfaces:**
- Game types: `PascalCase` (e.g., `GameState`, `PlayerView`, `ResolutionEvent`)
- Branded IDs: `${Name}Id` (e.g., `PlayerId`, `NodeId`, `CardId`)
- Enums: `SCREAMING_SNAKE_CASE` members (e.g., `Sector.RED`, `Phase.ORDERS`)
- Config objects: `lowercase` (e.g., `ruleset`, `settings`)

**Functions:**
- Pure / exported: `camelCase` (e.g., `createMatch`, `projectView`, `legalOrders`)
- Helpers / internal: `camelCase` (e.g., `scoreAction`, `reweightParticles`)
- Predicates: `is` or `has` prefix (e.g., `isLegal`, `hasPassive`)
- Queries: `get` or no prefix (e.g., `getAdjacentNodes`, `cooldownRemaining`)

## Where to Add New Code

**New Feature (e.g., new card, new map, new passive mechanic):**
- Design: Add rule to `docs/GAME_DESIGN.md` first
- Data: Add to `packages/engine/src/content/` (cards.ts, maps/, rulesets.ts)
- Logic: Implement in `packages/engine/src/` (usually a new resolution step or helper)
- Tests: Add to `packages/engine/tests/` (golden fixture + unit test)
- UI: Add component to `apps/web/components/` once Phase 2 lands

**New Component (e.g., new Personality):**
- Source: `packages/ai/src/personalities/` (new weight vector file)
- Export: Add to `packages/ai/src/personalities/index.ts`
- Validation: Run `pnpm sim` to validate against gates (distinguishability, monotonicity)
- Tests: Add to `packages/ai/tests/` (if validation gates fail, add unit test to debug)

**Bug Fix:**
- First: Write golden fixture in `packages/engine/tests/golden.test.ts` (before fix, it fails; after fix, it passes)
- Then: Fix in `packages/engine/src/` or `packages/ai/src/`
- Verify: `pnpm test` passes on both fixture and related unit tests

**New Utility:**
- Shared across packages: Add to `packages/shared/src/` (e.g., new branded ID type, new Zod schema)
- Engine-specific: Add to `packages/engine/src/` (e.g., new graph query)
- AI-specific: Add to `packages/ai/src/` (e.g., new feature extractor)

**UI Enhancement:**
- Browser component: `apps/web/components/` (match category — board, signals, replay, etc.)
- Client-side store: `apps/web/lib/store.ts` (Zustand slices for UI state)
- Styling: Tailwind classes inline; design tokens in CSS variables (Phase 2 will establish token set)

**Server-side Logic:**
- Match lifecycle: `apps/party/src/` (message handlers, order validation, bot runner)
- Lobby state: `apps/party/src/` (host settings, seat assignment)
- Persistence: `apps/party/src/` (to Neon Postgres in Phase 6)

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated architecture docs (this directory)
- Generated: Yes (via `/gsd-map-codebase`)
- Committed: Yes (docs for future phases)

**`packages/ai/sim/`:**
- Purpose: Headless balance validation harness
- Generated: No (source code)
- Committed: Yes
- Run with: `pnpm sim --matches 300 --profile`

**`packages/engine/tests/golden/`:**
- Purpose: Replay fixtures (byte-identical regression)
- Generated: No (source code), but regenerated on design change via `UPDATE_GOLDEN=1 pnpm test golden`
- Committed: Yes
- Schema: JSON array of `{ seed, settings, orders, expectedFinalState }`

**`node_modules/`, `.next/`, `dist/`, `build/`:**
- Purpose: Generated artifacts
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-08-18*

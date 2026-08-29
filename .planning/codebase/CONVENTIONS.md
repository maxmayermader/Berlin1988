# Coding Conventions

**Analysis Date:** 2026-08-18

## Naming Patterns

**Files:**
- Modules use `camelCase.ts` with descriptive names aligned to their single responsibility
- Examples: `legalOrders.ts`, `threatMap.ts`, `createMatch.ts`, `projectView.ts`
- Test files use `.test.ts` suffix: `rules.test.ts`, `fairness.test.ts`, `determinism.test.ts`
- Content data files in `src/content/` describe their payload: `cards.ts`, `rulesets.ts`, `loadouts.ts`

**Functions:**
- `camelCase` for all functions, including factory functions and queries
- Prefix by intent: `create*` (constructors), `is*` (predicates), `get*` (accessors), `has*` (existence checks), `validate*` (validation)
- Examples: `createMatch()`, `legalOrders()`, `projectView()`, `isReady()`, `hasPassive()`, `nodeOf()`, `distance()`, `seedRng()`
- Private methods use same case in class implementations

**Variables:**
- `camelCase` for all local variables and parameters
- Private class fields prefixed with `private readonly` or `private` keyword
- Examples: `const threat = createThreatMap()`, `let belief: Belief | null = null`, `private rng: RngState`
- Constants that are computed values stay `camelCase` (not `SCREAMING_SNAKE_CASE`)

**Types:**
- `PascalCase` for all type names, interfaces, and classes
- Branded id types with `Brand<T, B>` pattern: `PlayerId`, `AgentId`, `NodeId`, `CardId`, `MatchId`
- Examples: `PlayerView`, `GameState`, `AIAgent`, `ThreatMap`, `Personality`, `DifficultyTier`
- Use `type` for unions and readonly value types, `interface` for object shapes

## Code Style

**Formatting:**
- TypeScript strict mode with `strict: true` in `tsconfig.base.json`
- Additional strictness settings: `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`
- Target ES2022, module resolution 'Bundler'
- Use `verbatimModuleSyntax: true` for explicit type imports
- No explicit linter config detected; rely on TypeScript compiler strictness

**Linting:**
- No ESLint or Biome config found; project relies on TypeScript strict compiler checks
- Lint rule bans `Math.random()` anywhere in `packages/engine` — all randomness must flow through seeded PRNG in `GameState`
- Type safety is enforced at compile time: using `PlayerId` where `NodeId` expected is a compiler error

## Import Organization

**Order:**
1. `type` imports from external packages
2. Value imports from external packages
3. `type` imports from internal packages (using `@berlin/*` aliases)
4. Value imports from internal packages
5. Local relative imports: `from './relative/path.js'` with `.js` extension (ES modules)

**Path Aliases:**
```
@berlin/shared → packages/shared/src/index.ts
@berlin/engine → packages/engine/src/index.ts
@berlin/ai → packages/ai/src/index.ts
```

**Deep Imports:**
- **Forbidden:** never import from `packages/*/src/file.ts` directly
- **Required:** import only through barrel exports: `import { X } from '@berlin/package'`
- This is enforced as a build error, not a style preference

**Example from `packages/ai/src/agent.ts`:**
```typescript
import type {
  Action,
  AgentId,
  PlayerView,
  // ... more type imports
} from '@berlin/shared';
import {
  actionBudget,
  actionsUsed,
  // ... more value imports
} from '@berlin/engine';
import { cloneBelief, createBelief, type Belief } from './belief.js';
```

## Error Handling

**Strategy:**
- **Throws only for programmer errors** — functions that should never fail given correct usage throw `Error`
- **Returns empty/null for expected edge cases** — guards and early returns handle preconditions
- **No exceptions for rule violations** — `submitOrder()` returns a `SubmitResult` with rejection details, never throws

**Patterns:**
- Guard clauses at function start for illegal inputs (null checks, alive checks, phase checks)
- Example from `legalOrders.ts`: `if (!a || !a.alive || self.eliminated) return [];`
- Validation functions like `validateLoadout()` check constraints and return boolean or details
- Game-state validity checks in resolution pipeline return events with failure information, not exceptions
- Throws when internal invariants break: `const n = map.nodes.find(...); if (!n) throw new Error(...)`

## Logging

**Framework:** No centralized logging framework found; package-level constraints forbid console output in core packages

**Patterns:**
- `packages/engine`, `packages/shared`, `packages/ai` contain **zero logging** — these are pure libraries
- Logging only appropriate at application boundary (`apps/` layer)
- Simulation harness in `packages/ai/sim/run.ts` uses console for match metrics and reports
- All observable information must flow through return values and `ResolutionEvent[]` log, never side-effect logging

## Comments

**When to Comment:**
- **Document the "why", not the "what"** — code structure should make the what obvious
- Comments explain intent, constraints, and non-obvious reasoning
- Every public function or complex feature gets a JSDoc block
- Complex algorithms get inline comments explaining the approach

**JSDoc/TSDoc:**
- All exported functions and types receive JSDoc: `/** ... */` blocks above definitions
- Describe parameters, return values, and side-effects (especially "pure" claims and immutability)
- Example from `agent.ts`:
  ```typescript
  /**
   * An AI opponent.
   *
   * `decide` takes a PlayerView and an agent id — NOTHING ELSE. A bot sees
   * exactly what a human in that seat sees. Passing a GameState is a type error,
   * and tests/fairness.test.ts asserts it. Difficulty degrades the bot's
   * inference, never its information.
   */
  export interface AIAgent { ... }
  ```

**Inline Comments:**
- Use `//` comments for complex decision points and non-obvious logic flow
- Example from `agent.ts` explaining `predicted` field:
  ```typescript
  /**
   * The belief advanced ONE step further — where rivals will be after this
   * round's movement, not where they were at the end of last round.
   *
   * This is the whole game in one variable...
   */
  ```
- Comment blocks explaining game-design-driven decisions, not implementation details

## Function Design

**Size:**
- Prefer small, single-responsibility functions (~10-30 lines typical)
- Resolution pipeline in `packages/engine/src/resolution/` kept as separate modules for clarity
- Complex orchestration (like `Bot.decide()`) kept in one place but broken into clear stages (believe → score → choose)

**Parameters:**
- Favor named parameters over positional when function has 3+ parameters
- Prefix optional parameters with `prefix` or suffix with optional flag when order matters
- Example: `legalOrders(view: PlayerView, agent: AgentId, prefix: readonly Action[] = [])`
- Query functions take their subject as first parameter: `distance(map, from, to)`, `nodeOf(map, id)`

**Return Values:**
- Return empty collections over null when the "nothing" case is expected
- Return specific types to enforce compile-time constraints: `PlayerId` not `string`
- Immutable data structures: functions return new objects, never mutate inputs
- Example: `resolveRound()` returns `{ state: GameState; log: ResolutionEvent[] }`, a new `GameState` not a mutation

**Documentation in Signature:**
- Type signatures themselves document contracts: `(view: PlayerView, agentId: AgentId): Action[]` tells the AI it receives only what a human sees
- Branded types prevent id mixing at compile time: impossible to pass a `NodeId` to a function expecting `PlayerId`

## Module Design

**Exports:**
- Every package exports exactly one public surface: `src/index.ts`
- Only functions and types listed in `src/index.ts` are part of the public contract
- Implementation files (e.g., `belief.ts`, `threatMap.ts`) are internal and not re-exported
- This enforces the dependency direction: `shared ← engine ← ai`

**Barrel Files:**
- `src/index.ts` is the only barrel export
- Export both types and implementations needed by consumers
- Example from `packages/engine/src/index.ts`:
  ```typescript
  export { createMatch, quickSettings } from './createMatch.js';
  export { legalOrders, isLegal } from './legalOrders.js';
  export type { SubmitResult } from './submitOrder.js';
  ```

**No Side Effects at Module Load:**
- Zero initialization code that runs when the module is first imported
- No module-level `Math.random()` or `Date.now()` calls
- Randomness initialized via explicit function: `seedRng(seed)` returns an `RngState`
- This allows packages to be imported by simulation loops and CI without triggering side effects

**Module Purity:**
- `packages/engine` must be pure: no fetch, no filesystem, no console, no mutations
- `packages/shared` is pure: types and tiny helper functions only
- `packages/ai` is pure in decision: `decide()` is deterministic under seed; belief state held on instance
- Impurity allowed only at app boundary (`apps/`) for I/O and UI

## TypeScript-Specific Conventions

**Type vs. Interface:**
- Use `type` for branded ids, unions, and value types: `type PlayerId = Brand<string, 'PlayerId'>`
- Use `interface` for object shapes that represent data structures: `interface PlayerView { ... }`
- Interfaces are preferred for public APIs when the shape may be extended

**Generics:**
- Keep generic parameter names short and conventional: `T`, `K`, `V`
- Generic constraints should document intent: `<T extends NodeId>` is clearer than `T`

**Strict Mode Rules Applied:**
- All functions must have explicit return type annotations on exported functions
- Index access checked: `map.nodes[i]` may be undefined, use `?.` or find
- Switch statements must have default case or `noFallthroughCasesInSwitch` enforces exhaustiveness

---

*Convention analysis: 2026-08-18*

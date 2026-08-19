# Testing Patterns

**Analysis Date:** 2026-08-18

## Test Framework

**Runner:**
- Vitest 2.1.8
- Config: `vitest.config.ts` at repository root
- Node environment (no browser)
- ES modules throughout

**Assertion Library:**
- Vitest built-in expect() - no external assertion library

**Run Commands:**
```bash
pnpm test                 # Run all tests once
pnpm test:watch          # Watch mode for development
pnpm test golden         # Run golden replay tests only
UPDATE_GOLDEN=1 pnpm test golden  # Regenerate golden fixtures after intentional rules changes
```

**Vitest Configuration (`vitest.config.ts`):**
```typescript
test: {
  include: ['packages/**/tests/**/*.test.ts'],
  environment: 'node',
}
```

## Test File Organization

**Location:**
- Tests are **co-located with what they test** in `packages/*/tests/` directories
- Pattern: `packages/{package}/tests/{feature}.test.ts`
- Test files are not bundled or distributed; they exist only in the repository

**Naming:**
- `.test.ts` suffix for all test files
- File names match conceptual areas: `rules.test.ts`, `fairness.test.ts`, `determinism.test.ts`, `fog-leak.test.ts`, `golden.test.ts`, `contested.test.ts`, `soak.test.ts`

**Package Test Structure:**
```
packages/ai/
├── src/
├── tests/
│   ├── fairness.test.ts      # Validates bots receive only PlayerView
│   ├── validation.test.ts     # Bot-specific validation gates
│   └── (helpers shared across tests)
packages/engine/
├── src/
├── tests/
│   ├── rules.test.ts          # Core game rule behavior
│   ├── fog-leak.test.ts       # Security: no hidden state in views
│   ├── determinism.test.ts    # Replay and seed consistency
│   ├── contested.test.ts      # Safehouse contention and tiebreaks
│   ├── golden.test.ts         # Regression on frozen ruleset
│   ├── soak.test.ts           # 1400+ random matches
│   ├── scenario.ts            # Helper: fluent test builder
│   └── helpers.ts             # Shared test utilities
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest';

describe('feature name', () => {
  it('specific behavior under condition', () => {
    // Arrange: set up state and inputs
    const s = new Scenario('seed-name')
      .at(1, 'node-id')
      .at(2, 'node-id')
      .intel(1, 10)
      .order(1, [strike('target'), hold()]);
    
    // Act: invoke the system
    const { state, log } = resolveRound(s.state);
    
    // Assert: verify outcomes
    expect(state.players['p2']!.agents[0]!.alive).toBe(false);
  });
});
```

**Patterns:**

1. **Scenario Builder Pattern** — Complex test setup delegated to `Scenario` class:
   ```typescript
   const s = new Scenario('unique-seed')
     .at(playerId, nodeId)           // Agent position
     .intel(playerId, amount)         // Intel allocation
     .silencers(playerId, count)      // Silencer count
     .loadout(playerId, [cardIds])    // Custom deck
     .order(playerId, [actions])      // Action orders
   ```
   - Seed string ensures reproducibility
   - Fluent API chains configuration
   - `s.state` yields a `GameState` ready for testing

2. **Test Data Helpers** — Minimal function wrappers for actions:
   ```typescript
   strike(nodeId), move(nodeId), wiretap(nodeId), hold()
   ```
   - Located in `scenario.ts`
   - Simplify order construction vs. hand-building action objects

3. **State Inspection** — Assertions compare state and event logs:
   ```typescript
   const { state, log } = resolveRound(s.state);
   const result = log.find((e) => e.type === 'WIRETAP_RESULT');
   expect(result?.type === 'WIRETAP_RESULT' && result.results[0]!.occupied).toBe(true);
   ```
   - Return tuple from `resolveRound()` makes both state and effects available
   - Events are typed unions; use type guards to narrow
   - Events never contain hidden state (e.g., `WIRETAP_RESULT` never names targets)

4. **Parameterized Tests** — Loop over personalities and difficulties:
   ```typescript
   for (const personality of PERSONALITY_IDS) {
     for (const difficulty of DIFFICULTY_IDS) {
       const bot = createAgent(personality, difficulty, 'S');
       // Assert behavior for every combination
     }
   }
   ```
   - Used in `fairness.test.ts` to prove each bot variant behaves correctly
   - Used in `determinism.test.ts` to prove seeded reproducibility

5. **Fuzz Testing** — Random move enumeration for coverage:
   - Utility function `randomLegalMove()` in `helpers.ts`
   - `soak.test.ts` runs 1400+ randomized matches
   - Catches crashes, infinite loops, and state invariant violations

## Mocking

**Framework:** No explicit mocking library; tests use real objects and composition

**Patterns:**

1. **Composition over Mocking** — Pass real dependencies as arguments:
   ```typescript
   const state = createMatch(quickSettings(), 'seed-name');
   const bot = createAgent('MAREK', 'SPYMASTER', 'seed');
   const view = projectView(state, state.playerOrder[0]!);
   const actions = bot.decide(view, agent.id);
   ```
   - No mock bot or mock engine
   - Tests receive real implementations
   - Seed determinism makes real RNGs predictable

2. **Partial Fixtures** — Test builders isolate specific concerns:
   - `Scenario` sets only relevant fields, leaves others to defaults
   - Example: testing strike noise only sets positions and intel, uses default cards
   - Immutability of `GameState` makes partial fixtures safe

3. **What NOT to Mock:**
   - `PlayerView` projection — must test the real `projectView()` to catch fog leaks
   - `resolveRound()` — the whole point is testing resolution logic
   - `legalOrders()` — AI calls it for candidates; must match what humans can do
   - Engine functions — these are the thing being tested

4. **What Can Be Isolated:**
   - Bot opponent belief: create independent `Belief` particle filters with controlled `PlayerView` input
   - Feature scoring: pass known `PlayerView` and assert score output
   - Difficulty tiers: parameterized tests over each tier, fed same view

## Fixtures and Factories

**Test Data:**
- No external fixture files for unit tests (JSON files used only for golden replays)
- Inline builders (Scenario, helpers) generate test data at runtime
- Allows parametrization without duplication

**Example of inline fixture building:**
```typescript
it('reports OCCUPIED for an agent', () => {
  const s = new Scenario('scan')
    .at(1, 'friedrichstrasse')
    .at(2, 'alexanderplatz')
    .loadout(2, ['wt_red', 'st_red'])
    .intel(1, 10)
    .order(1, [wiretap('alexanderplatz'), hold()])
    .order(2, [hold(), hold()]);

  const { log } = resolveRound(s.state);
  const result = log.find((e) => e.type === 'WIRETAP_RESULT');
  expect(result?.type === 'WIRETAP_RESULT' && result.results[0]!.occupied).toBe(true);
});
```

**Golden Fixtures:**
- Location: `packages/engine/tests/golden/*.json`
- Format: Recorded match sequences with seed, orders, and expected event log
- Regeneration: `UPDATE_GOLDEN=1 pnpm test golden`
- Frozen ruleset: always test against `frozen-v1`, not `default` (allows balance retunes without invalidating regression net)
- Purpose: catch accidental rule changes across code refactors

## Coverage

**Requirements:** No explicit coverage target enforced in tooling

**Focus Areas (by design):**
- **Highest coverage:** `packages/engine` — rules are expensive to debug, cheap to test
- **High coverage:** `packages/ai` — bot personalities are a product feature
- **Test as needed:** `packages/shared` — types have minimal logic to test; leaks are caught by fog-leak.test.ts

**View Coverage:**
```bash
pnpm test          # Run all suites (coverage check part of CI)
```

No separate coverage command; CI run on every PR validates against the test suite as a gate.

## Test Types

**Unit Tests:**
- **Scope:** Single function or closely-related group
- **Location:** Inline in `.test.ts` files
- **Approach:** Setup inputs via Scenario or direct construction, assert outputs
- **Examples:**
  - `rules.test.ts`: strike noise, wiretap timing, passives, blockade behavior
  - `fairness.test.ts`: bot receives only `PlayerView`, determinism under seed
  - `contested.test.ts`: every branch of safehouse tiebreak ladder

**Integration Tests:**
- **Scope:** Multi-step round resolution with all systems interacting
- **Approach:** Set up initial state, submit orders from multiple players, resolve and inspect log
- **Examples:**
  - Strike killing, notifying neighbors, consuming silencers, affecting Burn Tracks
  - Wiretap scanning post-movement positions, Counter-Surveillance blocking first scan
  - Blockades closing nodes and burning trapped agents

**Property Tests:**
- **Scope:** Invariants that must hold over many random matches
- **Approach:** Generate random legal moves, run full matches, assert properties
- **Examples:**
  - `soak.test.ts`: 1400+ random-agent matches per run
  - No crashes, no hangs, no orphaned state
  - Intel always stays in valid range
  - Determinism: same seed → same match byte-for-byte

**Security/Regression Tests:**
- **Scope:** Fog-of-war boundary, Golden replays, submission semantics
- **Approach:**
  - `fog-leak.test.ts`: serialize random `PlayerView`s, scan for opponent agent ids, safehouse leaks, trap leaks
  - `golden.test.ts`: replay recorded matches, assert output is byte-identical
  - `determinism.test.ts`: re-run matches with same seed, assert same orders
- **Purpose:** Catch security bugs and silent rule changes

**E2E Tests:**
- **Status:** Not yet implemented
- **Scope:** Will test browser UI, lobby, deckbuilder, match UI once `apps/web` is built
- **Note:** Engine and AI are fully tested in isolation; E2E tests focus on UI and networking

## Common Patterns

**Async Testing:**
- No async patterns found in current test suite
- All tests are synchronous (engine and AI are deterministic and don't use async)
- When `apps/web` tests are added, vitest's async/await support will be used

**Error Testing:**
```typescript
it('throws when queried for an unknown node', () => {
  const map = DEFAULT_MAP;
  expect(() => nodeOf(map, nodeId('nonexistent'))).toThrow('Unknown node');
});
```

**Boundary Testing:**
```typescript
it('returns an empty action list when the agent is eliminated', () => {
  const state = createMatch(quickSettings(), 'seed');
  state.players['p1']!.agents[0]!.alive = false;
  const view = projectView(state, 'p1' as PlayerId);
  
  const actions = legalOrders(view, view.self.agents[0]!.id);
  expect(actions).toEqual([]);
});
```

**State Snapshot Testing:**
- No snapshot testing tool (no Jest snapshots)
- Assertions are explicit: `expect(value).toBe(exact)` or inspect `log` array

**Determinism Verification:**
```typescript
it('gives the same order for the same seed and view history', () => {
  const state = createMatch(quickSettings(), `det-personality`);
  const view = viewForOrdering(state, pid, `${pid}:a1`);
  
  const first = createAgent('MAREK', 'SPYMASTER', 'S').decide(view, agentId);
  const second = createAgent('MAREK', 'SPYMASTER', 'S').decide(view, agentId);
  
  expect(second).toEqual(first);  // Same seed, same view → same decision
});
```

## Test-Driven Rules

**Every bug fixed gets a golden fixture:**
- Resolution-ordering bugs are caught by recording a match and replaying it
- Golden test is the regression net
- Deleting a test when fixing its bug just brings it back in a future refactor

**Test the rules, not the implementation:**
- Assert on `ResolutionEvent[]` log and final `GameState`
- Tests that reach into pipeline internals (e.g., intermediate resolution step state) couple to refactoring
- Keep tests resilient to implementation changes as long as the rules are preserved

**Fog-leak audit is non-negotiable:**
- `fog-leak.test.ts` must reach every field in `PlayerView`
- Any new field added to `PlayerView` is a security change and must be scanned
- JSON serialization check ensures serialized views are safe to send to clients

**AI validation gates:**
- `fairness.test.ts` proves bots receive only `PlayerView` (no `GameState` imports)
- Determinism verified on every personality × difficulty combination
- Loadout validation ensures every bot builds a legal 10-card deck

---

*Testing analysis: 2026-08-18*

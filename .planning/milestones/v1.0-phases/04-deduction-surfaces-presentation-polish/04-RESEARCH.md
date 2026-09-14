# Phase 4: Deduction Surfaces & Presentation Polish - Research

**Researched:** 2026-09-02
**Domain:** Fog-of-war-safe history/state exposure (TypeScript rules engine) + client-side motion system (React/Next.js, `motion` package)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Round history is a server-side full match log, not client-side accumulation. `GameState` gains a persisted per-round log (in the spirit of the existing `lastRoundLog: ResolutionEvent[]` field at `packages/shared/src/state.ts:120`, but retained across all rounds instead of overwritten each round) and `PlayerView` carries the full fog-filtered history, not just `lastRound`. — **Reversibility:** costly — this is a `GameState`/`PlayerView` shape change touching `createMatch.ts`, the resolution pipeline, and `projectView.ts`; switching to client-only accumulation later would mean removing the field and rebuilding trust in client-side persistence instead.
- **D-02:** Round history survives refresh and mid-match reconnect (including Phase 3's D-08 AI-takeover-and-reclaim flow) because it lives on the server and is delivered via `PlayerView`, not accumulated client-side from live socket events.
- **D-03:** History UI is a condensed one-line-per-round summary list by default (round #, headline outcome), each row expandable to a full replay using the existing `StepThrough` component (`apps/web/components/resolution/StepThrough.tsx`) rather than building a second renderer.
- **D-04:** `PlayerView.burnTracks` already exists and is fully populated by the engine (`createMatch.ts`, `ctx.ts`'s `appendBurn`, `projectView.ts`) — this phase adds a UI panel over existing data, not new engine/protocol work.
- **D-05:** Cutout redaction (`sector: null` on a `BurnEntry`, applied once server-side at append time per `ctx.ts:113-119`) must render correctly in the panel: icon-only display with no color/sector indicator for redacted entries, not a raw dump of the entry object. The panel does not re-derive redaction — it trusts `sector === null` as the signal.
- **D-06:** New Burn Track entries get a call-out animation when they're appended after a round resolves — ties into the POLISH-01 motion work below, not a separate animation system.
- **D-07 (deferred from a broader ask):** The panel shows only the viewing player's own Burn Track this phase — an own-vs-opponents toggle/browser for other players' tracks was raised but not selected as in-scope; see Deferred Ideas.
- **D-08:** Extract a shared motion utility (e.g. `apps/web/lib/motion.ts` and/or a small wrapper component) from the pattern already established in `StepThrough.tsx` (`motion`/`useReducedMotion` from the `motion` package, already a dependency) rather than repeating the inline `useReducedMotion()` call per new component. Every new transition/hover/card-flip/loading treatment across home, deckbuilder, lobby, and match screens should route through this shared utility so durations/easings stay consistent and `prefers-reduced-motion` handling isn't duplicated per component. — **Reversibility:** reversible — this is additive extraction from existing working code; components can still call `motion`/`useReducedMotion` directly if the shared utility doesn't fit a case.

### Claude's Discretion
- Exact shape/name of the server-side round-log field and how it's threaded through `resolveRound()` (D-01) — planner/researcher to size against the existing `lastRoundLog` pattern. **This research's recommendation:** see Open Question 1 and Architecture Patterns 1/2 — `GameState.history: Record<PlayerId, ResolutionEvent[][]>` (per-player, pre-filtered, populated inside `resolveRound()`), with `PlayerView.history` exposing only the viewer's own flat `ResolutionEvent[][]` slice.
- Exact wording of round-history summary rows (D-03) and the Burn Track entry call-out animation's specific easing/duration (D-06) — implementer's call within the shared motion utility (D-08). The UI-SPEC's Copywriting Contract and Motion Contract already lock these down precisely; this research does not add new discretion here.
- Whether the shared motion utility (D-08) is a hook, a wrapper component, or both — planner's call based on what StepThrough's existing usage suggests generalizes cleanly. See Architecture Pattern 3 for a sketch of one viable shape.

### Deferred Ideas (OUT OF SCOPE)
- **Own-vs-opponents Burn Track browsing** — the panel could let a player inspect any opponent's Burn Track (all tracks are already symmetric/public per `docs/ARCHITECTURE.md` §4.2, so this would be low-cost to add), but was not selected as in-scope for this phase's discussion (D-07). Worth considering as a small follow-up or as part of this phase's implementation if time allows, since the data is already public and available — flagging for planner/executor judgment rather than a hard exclusion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATCH-06 | Player can view a round history/log of past resolutions | New `GameState.history`/`PlayerView.history` field (Architecture Patterns 1/2), populated once per round inside `resolveRound()` to avoid the state-drift bug in Pitfall 1/2; UI is `RoundHistoryPanel.tsx` reusing `StepThrough` per D-03 |
| MATCH-07 | Player can view their own Burn Track panel showing exactly what public information opponents have learned about them | Zero engine/protocol work — `PlayerView.burnTracks[view.self.id]` already delivered end-to-end (verified by direct read of `ctx.ts`, `projectView.ts`, `view.ts`); build `BurnTrackPanel.tsx` as a pure read, redaction rendering per D-05 |
| POLISH-01 | General UI transitions and micro-interactions applied consistently across lobby, deckbuilder, and match screens, respecting reduced-motion preferences | `apps/web/lib/motion.ts` extracted from `StepThrough.tsx`'s existing, working `motion`/`useReducedMotion` pattern (Architecture Pattern 3); `motion@13.1.0` already installed, no new dependency |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Directives relevant to this phase's plan, extracted from `./CLAUDE.md` and `.claude/CLAUDE.md`:

- **Dependency direction is one-way (`shared ← engine ← ai ← apps`).** The new `history` field must be added in `packages/shared` (type) and `packages/engine` (population logic) — never in `apps/party` or `apps/web` reaching "up" into the engine to compute it.
- **Engine purity: no `Math.random()`, `Date.now()`, fetch, or logging inside `packages/`.** The history-append logic added to `resolveRound()` must use only the existing `filterEvents()` call and `draft` state already threaded through — no new randomness, no timestamps.
- **`PlayerView` must never carry another player's agent positions, safehouse, traps, or cooldowns.** The new `history` field, being built from `filterEvents()` output, inherits this guarantee automatically — but per Open Question 1, `PlayerView.history` should expose only the viewer's own slice, never a `Record<PlayerId, ...>` of everyone's histories (unlike `burnTracks`, which is deliberately symmetric-public by game design).
- **`projectView()` changes are reviewed as security changes** (`packages/engine/src/fog/CLAUDE.md` rule 1). Any plan task touching `projectView.ts` should be flagged for extra review scrutiny and must keep `packages/engine/tests/fog-leak.test.ts` green.
- **No exceptions to `submitOrder()`-style non-throwing error handling are introduced.** This phase adds no new inbound client messages, so this constraint is inherited, not newly exercised.
- **Biome for lint/format, TypeScript `strict: true`, `verbatimModuleSyntax: true`.** New files (`apps/web/lib/motion.ts`, `RoundHistoryPanel.tsx`, `BurnTrackPanel.tsx`, `MatchIntelDrawer.tsx`) must use explicit `type` imports and pass `pnpm typecheck`.
- **Tests live beside what they test** — `packages/engine/tests/`, and colocated `.test.ts`/`.test.tsx` for `apps/web` — per the Validation Architecture section above.
- **`ui/` primitives (`Button.tsx`, `Banner.tsx`) never import `@berlin/engine`** (`apps/web/components/CLAUDE.md`) — the shared motion utility in `lib/` is client-side plumbing only and must not import engine types either, beyond what's already used for `ResolutionEvent` typing (which is a `@berlin/shared` type, already imported by `StepThrough.tsx` today, and permitted since `shared` is the zero-dependency vocabulary package, not the engine).

## Summary

This phase has two very different halves. MATCH-07 (Burn Track) is pure UI work over
data that already exists end-to-end — confirmed by reading `packages/shared/src/state.ts`,
`packages/engine/src/resolution/ctx.ts`, `packages/engine/src/fog/projectView.ts`, and
`packages/shared/src/view.ts` directly. MATCH-06 (round history) is genuinely new engine
work, and it is more dangerous than CONTEXT.md's framing suggests: the obvious
implementation — store every round's raw event log and re-run `filterEvents()` against it
later — is a fog-of-war correctness bug, not just an inefficiency, because
`filterEvents()`'s `STRIKE_FIRED` grading (`audibilityFor()` in `strikeNoise.ts`) reads the
**viewer's current agent positions** from the `GameState` passed to it. Re-filtering an old
round's log against the *current* round's `GameState` grades strike audibility using
positions that didn't exist yet at the time of that historical strike. The correct
construction is to filter every player's view of a round **once, at the moment that round
resolves** (inside `resolveRound()`, using the freshly-resolved `draft`, exactly the way
`lastRoundLog`/`lastRound` already implicitly get this right today only because there is
just one round to filter and it's always filtered against itself). Store the result
per-player, already redacted, the same shape discipline `burnTracks` already uses.

POLISH-01's motion work is comparatively low-risk: `motion` (imported as `motion/react`) is
already a dependency, already used correctly in `StepThrough.tsx` with a documented
reduced-motion policy, and the shared utility this phase adds is a refactor-and-extend of
an existing, working pattern — not a new library integration.

**Primary recommendation:** Build MATCH-06's persisted history as
`GameState.history: Record<PlayerId, ResolutionEvent[][]>` (or equivalent per-player
pre-filtered structure), populated once per player inside `resolveRound()` using the
resolved `draft` state before it's returned — never as a single global log re-filtered on
read. Build MATCH-07 as a pure UI read of the already-wired `view.burnTracks[view.self.id]`.
Build POLISH-01's `apps/web/lib/motion.ts` as an extraction of `StepThrough.tsx`'s existing
`motion`/`useReducedMotion` pattern, then refactor `StepThrough.tsx` onto it so there is
exactly one reduced-motion code path in the app.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persisted, fog-filtered round history | API / Backend (`packages/engine`, called by `apps/party`) | — | History must be computed once, at the moment of truth (round resolution), inside the pure engine — the same trust boundary as every other player-visible field. Storing raw history and filtering client-side or at arbitrary read-time would require the client to hold data it isn't entitled to, or would silently miscompute audibility (see Pitfall 1) |
| Round history UI (list + drill-down) | Browser / Client (`apps/web`) | — | Pure read of `PlayerView`; no server round-trip beyond what's already delivered over `ROUND_RESOLVED`/`VIEW` |
| Burn Track UI | Browser / Client (`apps/web`) | — | `PlayerView.burnTracks` is already delivered; zero new wire or engine work, confirmed by reading `projectView.ts` |
| Burn Track redaction display | Browser / Client (`apps/web`) | Database/Storage (redaction is applied once, server-side, at append time in `ctx.ts`) | The client never re-derives `sector === null` — it trusts the value. Redaction *logic* lives server-side; redaction *rendering* lives client-side |
| Motion / reduced-motion policy | Browser / Client (`apps/web/lib/motion.ts`) | — | Client-only concern; `prefers-reduced-motion` is a browser media query with no server involvement |
| Wire delivery of new history field | API / Backend (`apps/party/src/broadcast.ts` unchanged) → Browser | — | No `apps/party` code changes needed if the new field is added inside `packages/engine`'s `resolveRound()`/`projectView()` — `apps/party/src/round.ts` and `broadcast.ts` already forward whatever `resolveRound()`/`projectView()` return, unmodified |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `motion` (imported as `motion/react`) | 13.1.0 (installed) — 13.2.0 is current upstream [VERIFIED: npm registry, `npm view motion version`] | Panel/list transitions, card flips, `useReducedMotion()` | Already the project's sole animation primitive (`StepThrough.tsx`); this phase generalizes, not introduces |

No new runtime dependencies are needed for this phase. `apps/web/package.json` [VERIFIED: apps/web/package.json:14] already lists `"motion": "13.1.0"`, and `StepThrough.tsx` [VERIFIED: apps/web/components/resolution/StepThrough.tsx:4] already does `import { motion, useReducedMotion } from 'motion/react';` — confirming both the UI-SPEC's version claim and its import-path claim.

### Supporting
None — this phase is entirely built from packages already in the workspace (`@berlin/shared`, `@berlin/engine`, `zustand`, `motion`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-player pre-filtered history stored in `GameState` | Store raw `ResolutionEvent[][]` once, re-run `filterEvents()` per player at `projectView()` time (read-time filtering) | **Rejected** — this is the Pitfall 1 bug: `filterEvents()`'s `STRIKE_FIRED` branch depends on the *viewer's current* agent positions via `audibilityFor()`, which are wrong for any round except the most recent one. Read-time filtering of historical rounds silently mis-grades strike audibility (both over- and under-redaction are possible) |
| Storing full `GameState` snapshots per round to re-derive views correctly later | Storing only the fog-filtered event views | Full-state snapshots would fix the audibility problem too (filter each historical log against its own contemporaneous `GameState`), but at far higher memory cost (14 rounds × full `GameState` per match) for no benefit over filtering once at resolution time and discarding the raw log |

**Installation:** None — no new packages.

**Version verification:** `npm view motion version` → `13.2.0` current on the registry; `apps/web/package.json` pins `13.1.0`, already installed and working. No version bump needed or recommended for this phase (out of scope; not blocking).

## Package Legitimacy Audit

No external packages are installed by this phase. `motion` is an existing, already-vetted dependency reused from Phases 1–3; no new package.json entries are proposed. This section is intentionally empty — the gate does not apply.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │        packages/engine (pure)            │
                         │                                          │
  submitOrder() x N ───▶ │  resolveRound(state)                     │
  (apps/party/round.ts)  │    1. run 11-step pipeline → ctx.log     │
                         │    2. draft.lastRoundLog = ctx.log       │  (unchanged)
                         │    3. draft.history[pid].push(           │  (NEW, D-01)
                         │         filterEvents(draft, ctx.log, pid)│
                         │       )  for every pid in playerOrder    │
                         │    4. draft.burnTracks already appended  │  (unchanged, per playCard/firePassive
                         │       incrementally during the pipeline  │   in ctx.ts — happens DURING steps 1-11,
                         │       (ctx.ts's playCard/firePassive)    │   not after — already correct today)
                         │  → returns new GameState                 │
                         └──────────────┬───────────────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────────────────┐
                         │   projectView(state, viewer)              │
                         │     self, opponents, visibleNodes,        │
                         │     burnTracks[all players] (unchanged)   │
                         │     lastRound = filterEvents(state,       │  (unchanged)
                         │                   state.lastRoundLog, v)  │
                         │     history = state.history[viewer]       │  (NEW, D-01 — direct
                         │              (already filtered, no        │   read, no re-filter)
                         │               re-filtering here)          │
                         └──────────────┬───────────────────────────┘
                                        │  PlayerView (per connection)
                                        ▼
                         ┌─────────────────────────────────────────┐
                         │   apps/party/src/broadcast.ts             │
                         │   sendResolved()/sendViews() — UNCHANGED  │
                         │   (already forwards whatever projectView  │
                         │    returns, per-connection)               │
                         └──────────────┬───────────────────────────┘
                                        │  ROUND_RESOLVED { view }
                                        ▼
                         ┌─────────────────────────────────────────┐
                         │   apps/web/lib/socket.ts                  │
                         │   setView(message.view) — UNCHANGED       │
                         │   (view.history rides along for free;     │
                         │    no new socket.ts branch needed)        │
                         └──────────────┬───────────────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────────────────┐
                         │  apps/web/components/match/               │
                         │  MatchIntelDrawer.tsx (NEW)                │
                         │   ├─ RoundHistoryPanel.tsx (NEW)           │
                         │   │    reads view.history[view.self.id]    │
                         │   │    row → expand → <StepThrough/>       │
                         │   │    (existing component, reused as-is) │
                         │   └─ BurnTrackPanel.tsx (NEW)               │
                         │        reads view.burnTracks[view.self.id] │
                         │        (already-wired data, D-04)          │
                         └─────────────────────────────────────────┘
```

### Recommended Project Structure
```
packages/shared/src/
├── state.ts          # + history?: Record<string, ResolutionEvent[][]> on GameState
├── view.ts            # + history: Readonly<Record<string, readonly ResolutionEvent[][]>> — or a
                        #   narrower per-viewer shape (see Open Questions) on PlayerView

packages/engine/src/
├── createMatch.ts      # initialize history[pid] = [] for every seat, alongside burnTracks
├── resolution/index.ts # resolveRound(): after draft.lastRoundLog = ctx.log, also
                         # append the per-player filtered view to draft.history
├── fog/projectView.ts  # PlayerView.history = state.history[viewer] ?? [] (direct copy,
                         # no filterEvents() call at this layer — already filtered)

apps/web/
├── lib/
│   └── motion.ts               # NEW — DURATION/EASING tokens, fadeSlideUp/cardFlip variants,
│                                #   a useMotionPreset() or similar hook wrapping useReducedMotion()
├── components/
│   ├── resolution/
│   │   ├── StepThrough.tsx      # refactored onto lib/motion.ts (same behavior, one call site)
│   │   └── RoundHistoryPanel.tsx  # NEW — condensed rows, expand-in-place into StepThrough
│   ├── intel/
│   │   └── BurnTrackPanel.tsx     # NEW — directory does not exist yet; components/CLAUDE.md
│   │                               #   already documents intel/ as the expected home
│   └── match/
│       ├── MatchChat.tsx          # existing corner-dock template (bottom-right), motion added
│       └── MatchIntelDrawer.tsx   # NEW — bottom-left sibling dock, tabs History/Burn Track
```

### Pattern 1: Per-player pre-filtered history, computed once at resolution
**What:** Instead of storing one global `ResolutionEvent[][]` and filtering per-viewer on
every `projectView()` call, compute and store the filtered view **per player** at the
moment `resolveRound()` finishes each round, while the `draft` state still reflects that
round's post-resolution positions.
**When to use:** Any time a historical, already-resolved fact needs to be shown later
through a filter that depends on state that changes over time (agent positions, in this
codebase's case).
**Example:**
```typescript
// packages/engine/src/resolution/index.ts — inside resolveRound(), near the
// existing `draft.lastRoundLog = ctx.log;` line (index.ts:62)
draft.lastRoundLog = ctx.log;
for (const pid of draft.playerOrder) {
  const filtered = filterEvents(draft, ctx.log, pid); // draft = THIS round's resolved state
  const existing = draft.history[pid as string] ?? [];
  draft.history[pid as string] = [...existing, filtered];
}
draft.signals = generateSignals(draft, ctx.log);
draft.pendingOrders = {};
```
This mirrors the existing `burnTracks` discipline exactly: `ctx.ts`'s `appendBurn()`
[VERIFIED: packages/engine/src/resolution/ctx.ts:114-120] redacts once, at append time,
so every future reader (including the owner) sees the identical row — never a
re-derivation. History should follow the same "compute once, store the answer" rule,
just at round-boundary granularity instead of per-card-play granularity.

### Pattern 2: `PlayerView` fields that are direct copies, not projections
**What:** `projectView.ts`'s `burnTracks` construction [VERIFIED: packages/engine/src/fog/projectView.ts:96-99] is a direct per-player copy of `state.burnTracks[id]`, not a filter call — because the redaction already happened upstream in `ctx.ts`. The new `history` field should follow this exact shape: `projectView()` reads `state.history[viewer] ?? []` and copies it, with no `filterEvents()` call inside `projectView.ts` itself.
**When to use:** Whenever upstream code has already produced the fully-redacted, per-player-correct answer.
**Example:**
```typescript
// packages/engine/src/fog/projectView.ts — sibling to the existing burnTracks block
const history = (state.history?.[viewer as string] ?? []).map((round) =>
  round.map((e) => ({ ...e })),
);
```

### Pattern 3: Shared motion utility wrapping `useReducedMotion()` once
**What:** `StepThrough.tsx` [VERIFIED: apps/web/components/resolution/StepThrough.tsx:36,48] calls `useReducedMotion()` directly and branches `initial={reducedMotion ? false : {...}}`. `apps/web/lib/motion.ts` should export the duration/easing tokens plus one or two `motion.li`/`motion.div` "variant" helpers (e.g. `fadeSlideUp`, `cardFlip`) that already encode this reduced-motion branch, so new components import a ready-made variant object instead of re-deriving the `reducedMotion ? false : {...}` conditional.
**When to use:** Every new transform-based animation this phase (round-history row entry, Burn Track card-flip call-out, deckbuilder tile flip, Intel drawer expand/collapse, `MatchChat` expand/collapse per the UI-SPEC's Motion Contract item 5).
**Example:**
```typescript
// apps/web/lib/motion.ts — pattern sketch, not a verbatim requirement
// Source: generalizes apps/web/components/resolution/StepThrough.tsx:36-51
export const DURATION = { fast: 0.15, base: 0.25, slow: 0.35 } as const;
export const EASING = { standard: [0.4, 0, 0.2, 1] } as const;

export function fadeSlideUpVariant(reducedMotion: boolean | null) {
  return {
    initial: reducedMotion ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.base, ease: EASING.standard },
  } as const;
}
```

### Anti-Patterns to Avoid
- **Re-filtering historical rounds at read time:** Calling `filterEvents(currentState, oldRoundLog, viewer)` at `projectView()` time for any round other than the one that just resolved. This produces incorrect `STRIKE_FIRED` audibility grading because `audibilityFor()` reads the viewer's *current* agent positions (Pitfall 1).
- **Duplicating the reduced-motion conditional per component:** D-08 exists specifically because `StepThrough.tsx`'s `reducedMotion ? false : {...}` pattern would otherwise be copy-pasted into 5+ new components this phase, and a future one is guaranteed to forget it. Route everything through `apps/web/lib/motion.ts`.
- **A second event-log renderer for round history:** D-03 is explicit — the expanded row reuses `StepThrough` verbatim (it already takes `log`/`round`/`isFinal` props and needs no changes for this reuse; `isFinal` should be `false` for every historical round, same as the current live-resolution call site [VERIFIED: apps/web/app/match/[code]/page.tsx:188]).
- **Building a Burn Track "Redacted" placeholder/tag:** Per D-05 and the UI-SPEC's Color section, a redacted entry (`sector === null`) must render with icon and round-number only — no synthetic "Redacted"/"Cutout" label. The absence of a sector swatch *is* the signal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fog-filtering historical events | A second, ad hoc redaction pass for "old" events (e.g. redacting agent ids by regex on the client) | The existing `filterEvents()`/`ctx.appendBurn()` machinery, called at the correct time (resolution) per Pattern 1/2 | There is exactly one fog-filtering implementation in the codebase (`packages/engine/src/fog/`), and it is reviewed as a security boundary (`packages/engine/src/fog/CLAUDE.md` rule 1). A second implementation, even a client-side display-only one, risks drifting from it and is explicitly the anti-pattern `packages/engine/CLAUDE.md`'s "projectView is a security boundary" warns against |
| Reduced-motion detection | A custom `matchMedia('(prefers-reduced-motion: reduce)')` listener | `useReducedMotion()` from `motion/react`, already used by `StepThrough.tsx` | One canonical source avoids two components disagreeing about the user's OS preference |
| Round headline summarization | Inline JSX string-building per row component | A single exported function in `apps/web/lib/format.ts`, per the UI-SPEC's Copywriting Contract | `apps/web/lib/CLAUDE.md` rule 5: "Keep format.ts as the single source of human-readable event text — the visual log and the screen-reader announcement should never drift apart." `format.ts` already exists [VERIFIED: apps/web/lib/format.ts] as the established home for this |

**Key insight:** This phase's biggest risk isn't a missing library — it's re-deriving
fog-of-war logic outside the one reviewed boundary that already implements it correctly for
the *current* round. Every new surface should be "read what the engine already computed and
stored," never "compute redaction/audibility again in the UI or at an arbitrary later
point."

## Runtime State Inventory

Not applicable — this is a greenfield feature phase (new fields, new components), not a
rename/refactor/migration phase. No existing runtime data, service config, OS-registered
state, secrets, or build artifacts are being renamed or relocated.

## Common Pitfalls

### Pitfall 1: Re-filtering historical rounds with the current `GameState` silently mis-grades strike audibility
**What goes wrong:** If the persisted history is stored as a single raw `ResolutionEvent[][]` (one array per round, unfiltered) and `projectView()` calls `filterEvents(state, oldRound, viewer)` for each stored round using the *current* `GameState`, `STRIKE_FIRED` events from old rounds get graded by `audibilityFor()` [VERIFIED: packages/engine/src/fog/strikeNoise.ts:16-38, verbatim: `const nearby = p.agents.some((a) => a.alive && (a.nodeId === ev.from || a.nodeId === ev.target || areAdjacent(state.map, a.nodeId, ev.from) || areAdjacent(state.map, a.nodeId, ev.target)))`] against the viewer's agents' **current** node positions, not their positions at the time of that historical strike. A player who has since moved away from (or into) the vicinity of an old strike will see that old event appear/disappear incorrectly on repeated views, and — worse — a player who happens to currently be near where an old strike occurred but wasn't at the time gets upgraded to `EXACT` audibility for an event they were never entitled to see in full. This is a genuine fog-of-war leak risk, not just a display bug.
**Why it happens:** `filterEvents()` and `audibilityFor()` were designed and are only ever called today [VERIFIED: packages/engine/src/fog/projectView.ts:115, the sole call site] against the *just-resolved* `state` for the *just-resolved* round — the two are always contemporaneous today because only one round of history (`lastRoundLog`) exists. Extending history to multiple rounds breaks that implicit assumption unless filtering happens once, at the moment each round resolves.
**How to avoid:** Filter (or otherwise finalize) each round's per-player view **inside `resolveRound()`**, using the `draft` state as it exists immediately after that round's pipeline runs and before any subsequent round can change agent positions — exactly as Pattern 1 above describes. Store the already-filtered result; never re-run `filterEvents()` against a later `GameState` for an earlier round's log.
**Warning signs:** A test that submits a strike in round 2, then moves the viewer's agent adjacent to that strike's location in round 3+, and asserts the round-2 history entry's audibility grading is stable across rounds — this test would catch the bug if it exists. Absence of such a test is itself a warning sign.

### Pitfall 2: `AGENT_BURNED`'s killer-identity and Sleeper Cell redaction is also state-dependent
**What goes wrong:** `filterEvents()`'s `AGENT_BURNED` case [VERIFIED: packages/engine/src/fog/filterEvents.ts:89-102, verbatim: `const knowsKiller = (ev.byPlayerId !== null && mine(ev.byPlayerId)) || (mine(ev.playerId) && victim !== undefined && hasPassive(victim, 'SLEEPER_CELL'));`] reads `hasPassive(victim, 'SLEEPER_CELL')` from the state passed in. If that state is the *current* `GameState` rather than the state as of the burn, and the passive's cooldown/consumption state has since changed, historical re-derivation could disagree with what was true at burn time.
**Why it happens:** Same root cause as Pitfall 1 — any `filterEvents()` branch that reads live player/agent state rather than only the event's own fields is only safe to call against a contemporaneous `GameState`.
**How to avoid:** Same fix as Pitfall 1 — filtering all event types happens once, at round-resolution time, inside `resolveRound()`. This also means Pitfall 1's fix automatically fixes this one; no branch-by-branch patching is needed if Pattern 1/2 is followed.
**Warning signs:** Any code path that calls `filterEvents()` with anything other than the `draft`/`state` object that was itself just produced by the same `resolveRound()` call.

### Pitfall 3: Adding a new `GameState` field does not automatically flow through `apps/party`
**What goes wrong:** Assuming `apps/party/src/round.ts`'s `closeRound()` needs changes to thread the new history field through.
**Why it happens:** It's a reasonable initial assumption for anyone unfamiliar with the codebase's structure.
**How to avoid:** It does not — verified by reading `round.ts` [VERIFIED: apps/party/src/round.ts:24-37]: `closeRound()` calls `resolveRound(pre)` and returns whatever `resolved` (renamed `state`) contains, unmodified. `broadcast.ts`'s `sendResolved()`/`sendViews()` [VERIFIED: apps/party/src/broadcast.ts:40-49,86-95] call `projectView(gameState, playerId)` and forward the whole `PlayerView` object — any new field on `PlayerView` rides along automatically. Zero changes needed in `apps/party/` for D-01, confirming CONTEXT.md's framing that this is contained to `packages/shared` + `packages/engine`.
**Warning signs:** A plan task that proposes editing `apps/party/src/round.ts` or `broadcast.ts` for this phase — that's a sign the engine-side field wasn't designed to flow through `resolveRound()`'s return value correctly.

### Pitfall 4: Golden replay fixtures are keyed off an explicit fingerprint, not the whole `GameState` — but confirm before assuming safety
**What goes wrong:** Assuming adding a `history` field to `GameState` will churn `packages/engine/tests/golden/*.json` fixtures and require `UPDATE_GOLDEN=1 pnpm test golden`.
**Why it happens:** A naive `JSON.stringify(state)`-style fingerprint would indeed break on any new field.
**How to avoid:** `fingerprint()` in `packages/engine/tests/helpers.ts` [VERIFIED: packages/engine/tests/helpers.ts:128-146, verbatim fields listed: `round, phase, rng, outcome, players: {id, intel, safehouse, eliminated, burnsInflicted, dossiersExtracted, passives, agents: {id, node, alive, d}}, nodes: {...}`] is an explicit whitelist that does **not** include `burnTracks`, `lastRoundLog`, `signals`, or (would not include) a new `history` field. Adding `GameState.history` should **not** require regenerating golden fixtures. This should still be verified by running `pnpm test golden` after implementation (not assumed), since `helpers.ts` could theoretically be extended elsewhere, but no evidence of that was found this session.
**Warning signs:** `pnpm test golden` failing after adding the field would indicate the fingerprint was extended since this research — check `helpers.ts` again if so.

### Pitfall 5: `apps/web/components/intel/` does not exist yet, despite being documented
**What goes wrong:** Assuming `components/intel/` already has scaffolding because `apps/web/components/CLAUDE.md` documents it as an expected directory (`"Burn Track panels (all players including your own), signals log, informant reports, passive-card status, silencer stock"`).
**Why it happens:** The CLAUDE.md documents the *intended* structure for the whole project, written ahead of implementation; it is aspirational in places, not a snapshot of what exists.
**How to avoid:** Verified via `find apps/web/components -type d` this session — no `intel/` directory exists in the repo yet. The planner should create it fresh, per the UI-SPEC's stated new-file list (`components/intel/BurnTrackPanel.tsx`).
**Warning signs:** None specific — just don't skip the directory-creation step assuming it's a "move existing files" task.

## Code Examples

### Reusing StepThrough for a historical round (D-03)
```typescript
// apps/web/components/resolution/RoundHistoryPanel.tsx — sketch, not verbatim
// Source: pattern matches apps/web/app/match/[code]/page.tsx:181-189's existing
// live-resolution call site
import { StepThrough } from './StepThrough.js';

function HistoryRow({ round, log }: { round: number; log: readonly ResolutionEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!expanded) {
    return (
      <button type="button" onClick={() => setExpanded(true)} aria-label={`Expand round ${round}`}>
        {/* headline text from lib/format.ts's new exported function */}
      </button>
    );
  }
  return <StepThrough log={log} round={round} isFinal={false} />;
}
```

### Reading the Burn Track (D-04) — no new engine call needed
```typescript
// apps/web/components/intel/BurnTrackPanel.tsx — sketch
// Source: packages/shared/src/view.ts:133, already-wired field
const myTrack = view.burnTracks[view.self.id] ?? [];
// entry.sector === null  →  redacted, render icon + round only (D-05)
// entry.sector !== null  →  render icon + 4-letter sector label + round
```

### `filterEvents` call site to copy for the resolution-time history append
```typescript
// Source: packages/engine/src/fog/projectView.ts:115 (the one existing call site)
lastRound: filterEvents(state, state.lastRoundLog, viewer),
// The new history-append (inside resolveRound(), not projectView()) should call
// filterEvents the same way, but against `draft` (this round's freshly-resolved
// state) rather than a later `state` — see Pattern 1.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is the project's first round-history feature | Per-player pre-filtered history stored at resolution time | This phase | Establishes the precedent for any future "look back at derived-and-filtered state" feature; the same pattern should be reused rather than re-litigated |

**Deprecated/outdated:** Nothing in this codebase is being deprecated by this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact field name/shape for the new persisted history (`GameState.history: Record<PlayerId, ResolutionEvent[][]>`) is a suggestion, not a locked decision — CONTEXT.md's D-01 explicitly leaves "exact shape/name of the server-side round-log field" to the planner's discretion. If the planner picks a differently-shaped field (e.g. a single global log filtered per-request), Pitfall 1's correctness argument still applies and must still be honored | Architecture Patterns, Pitfall 1 | If a future implementer picks the naive shape without reading Pitfall 1, the app ships a subtle fog-of-war leak in round-history strike audibility |
| A2 | `hasPassive`/Sleeper Cell interaction in `filterEvents`'s `AGENT_BURNED` branch (Pitfall 2) is a second instance of the same state-dependency bug class as Pitfall 1, but was not empirically tested this session (no test was run reproducing a passive-state change between burn time and a later view) — reasoned from reading the source, not from a runtime reproduction | Pitfall 2 | Low — the fix (filter once, at resolution time) is identical to Pitfall 1's fix, so getting Pitfall 1 right also fixes this regardless of whether the specific scenario was empirically confirmed |
| A3 | `motion` 13.1.0 → 13.2.0 registry currency check was a simple `npm view`, not a changelog read — assumed no breaking API change between the two given both are within an already-adopted major version and the phase does not require a bump | Standard Stack | Very low — this phase does not propose bumping the version; purely informational |

## Open Questions

1. **Should `PlayerView.history` carry only the viewer's own filtered rounds, or (mirroring `burnTracks`) every player's, symmetric?**
   - What we know: `burnTracks` is deliberately symmetric/public (`docs/ARCHITECTURE.md` §4.2) because Burn Track data *is* public by game design. Round history is different — CONTEXT.md's D-03 and the UI-SPEC frame this purely as "your own match log," and `filterEvents()`'s whole purpose is to produce a *viewer-specific* subset (unlike Burn Tracks, which need no per-viewer variation because they were never secret to begin with).
   - What's unclear: Whether `GameState.history` should be keyed by every player (`Record<PlayerId, ResolutionEvent[][]>`, mirroring `burnTracks`'s existing shape for consistency) even though only `state.history[viewer]` is ever read out for that viewer's own `PlayerView.history`, or whether it's simpler/leaner to store `Record<PlayerId, ResolutionEvent[][]>` regardless since the per-player filtering already has to run for every player at resolution time to catch every viewer's redaction (not just one) — this is really the same data either way, just a naming question.
   - Recommendation: Use `Record<PlayerId, ResolutionEvent[][]>` on `GameState` (server-only, holds everyone's filtered history so each future view read is O(1)), but expose only `viewer`'s own slice as `PlayerView.history: readonly ResolutionEvent[][]` (a flat array, not a record) on the client type — since a client never needs another player's filtered history and `PlayerView`'s whole design principle is "no field capable of holding data this viewer isn't entitled to," even in already-filtered form for other players.

2. **Does round history need a wire-level fog test analogous to `apps/party/tests/fog-wire.test.ts`?**
   - What we know: `fog-wire.test.ts` [VERIFIED: apps/party/tests/fog-wire.test.ts:1-40] exists specifically because `PlayerView` type-safety doesn't guarantee wire-safety — it scans actual serialized frames.
   - What's unclear: Whether the planner should extend this existing suite (adding history-specific assertions) or whether `packages/engine/tests/fog-leak.test.ts`'s existing scan already covers any new `PlayerView` field automatically since it deep-scans the whole serialized view for opponent ids.
   - Recommendation: Both — `fog-leak.test.ts`'s deep-scan should already catch an opponent agent id leaking into `history` with no changes (it scans the whole serialized object), but per `packages/engine/tests/CLAUDE.md`'s explicit rule ("If you add a field to `PlayerView`, confirm the scan still reaches it"), the planner should add an explicit assertion exercising a multi-round scenario (submit orders across 3+ rounds, move an agent between rounds, assert historical `STRIKE_FIRED` audibility doesn't change when a later-round position would have graded it differently) to close Pitfall 1 specifically, since a generic id-leak scan would not catch an audibility *mis-grading* (nothing "leaks" in the id sense — the wrong redaction level is chosen).

## Environment Availability

Skipped — this phase has no new external tool/service dependencies. All required tooling (Node 22+, pnpm, TypeScript, Vitest, the `motion` npm package) is already installed and in use by Phases 1–3, confirmed via `package.json` reads this session.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^2.1.8 [VERIFIED: package.json:16] |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `pnpm test <pattern>` (e.g. `pnpm test golden`, `pnpm test fog-leak`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MATCH-06 | `resolveRound()` persists a per-player filtered history entry each round, matching `lastRoundLog`'s content for that round | unit | `pnpm test resolution` (new spec, e.g. `packages/engine/tests/history.test.ts`) | ❌ Wave 0 |
| MATCH-06 | Historical `STRIKE_FIRED` audibility does not change when a viewer's agent later moves near/away from the old strike location (Pitfall 1 regression) | unit | `pnpm test history` (same new spec) | ❌ Wave 0 |
| MATCH-06 | `fog-leak.test.ts`'s existing deep-scan still passes with `history` present in serialized `PlayerView`s | unit | `pnpm test fog-leak` | ✅ (existing file, extend if needed) |
| MATCH-06 | Round History panel renders condensed rows, empty state, and expands into `StepThrough` (UI Considerations table) | component/unit (static-source or DOM, per Phase 1-3 precedent) | `pnpm test roundHistoryPanel` (new) | ❌ Wave 0 |
| MATCH-07 | Burn Track panel renders redacted entries icon-only, non-redacted entries with sector label | unit | `pnpm test burnTrackPanel` (new) | ❌ Wave 0 |
| POLISH-01 | `apps/web/lib/motion.ts` exports duration/easing tokens and a reduced-motion-aware variant helper; `StepThrough.tsx` is refactored to import from it (source-based assertion, per `stepThrough.test.ts`'s existing `useReducedMotion` string-presence precedent) | unit (static-source) | `pnpm test motion` (new) + `pnpm test stepThrough` (existing, must stay green) | ❌ Wave 0 (motion.ts spec) / ✅ (stepThrough.test.ts exists) |
| POLISH-01 | Existing `StepThrough.tsx` reduced-motion behavior is unchanged after refactor | unit | `pnpm test stepThrough` | ✅ |

### Sampling Rate
- **Per task commit:** `pnpm test <touched-area-pattern>` (e.g. `pnpm test history`, `pnpm test motion`)
- **Per wave merge:** `pnpm test` (full suite) + `pnpm typecheck`
- **Phase gate:** Full suite green, plus `pnpm test golden` explicitly re-run to confirm Pitfall 4's "no fixture churn expected" claim holds in practice before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/engine/tests/history.test.ts` — covers MATCH-06's persisted-history correctness and the Pitfall 1 audibility-stability regression
- [ ] `apps/web/lib/motion.test.ts` (or equivalent) — static-source assertions for the new shared utility, mirroring `stepThrough.test.ts`'s existing pattern (`imports useReducedMotion from motion/react` style checks)
- [ ] `apps/web/components/resolution/RoundHistoryPanel.test.tsx` (or `.ts` if following the static-source convention) — covers empty state, row rendering, expand-to-StepThrough
- [ ] `apps/web/components/intel/BurnTrackPanel.test.tsx` — covers redacted vs. non-redacted entry rendering (D-05)
- No new test framework install needed — Vitest is already configured and used identically across `packages/engine`, `packages/ai`, and `apps/web`/`apps/party`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth changes this phase (no accounts in v1, per `.planning/REQUIREMENTS.md`) |
| V3 Session Management | No | No session changes |
| V4 Access Control | Yes | The project's own fog-of-war boundary (`projectView()`, `filterEvents()`) *is* this codebase's access-control layer for match data — this phase's core risk (Pitfall 1) is exactly a V4-class access-control correctness bug (information disclosure via stale-state-derived authorization) |
| V5 Input Validation | No | This phase adds no new client→server messages; existing `SUBMIT_ORDER` etc. validation is untouched |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Time-of-check/time-of-use style state drift: filtering event A against state B where B postdates A | Information Disclosure | Filter each round's events using the state as it existed at that round's resolution, never a later state (Pattern 1/Pitfall 1) |
| A new `PlayerView` field silently carrying opponent hidden state | Information Disclosure | `packages/engine/tests/fog-leak.test.ts`'s existing deep-scan (no code change needed, but MUST be re-run and, per its own file's rule, explicitly confirmed to reach the new field) |
| A new server-authoritative field never reaching the client because a manual transcription step was added instead of trusting the existing `resolveRound()`/`projectView()`/`broadcast.ts` pass-through chain | Denial of Service (feature simply doesn't work) / not a security threat per se, but a correctness one | Verified this session that no `apps/party/` changes are needed (Pitfall 3) — do not add a parallel manual serialization path |

## Sources

### Primary (HIGH confidence — read directly this session)
- `packages/shared/src/state.ts` — `GameState`, `BurnEntry`, `PlayerSecrets` shapes
- `packages/shared/src/view.ts` — `PlayerView`, `SelfView`, `Signal` shapes
- `packages/engine/src/fog/projectView.ts` — the fog boundary construction
- `packages/engine/src/fog/filterEvents.ts` — per-event-type redaction logic, including the position-dependent `STRIKE_FIRED`/`AGENT_BURNED` branches
- `packages/engine/src/fog/strikeNoise.ts` — `audibilityFor()`, the root of Pitfall 1
- `packages/engine/src/fog/visibility.ts` — `visionGroup()`
- `packages/engine/src/resolution/ctx.ts` — `playCard()`/`appendBurn()`, Burn Track redaction-at-append-time
- `packages/engine/src/resolution/index.ts` — `resolveRound()`, the exact append point for the new history field
- `packages/engine/src/createMatch.ts` — `burnTracks`/`lastRoundLog` initialization pattern to mirror for `history`
- `apps/party/src/broadcast.ts` — `sendResolved()`/`sendViews()`, confirms zero `apps/party` changes needed
- `apps/party/src/round.ts` — the sole `resolveRound()` call site outside `packages/`
- `apps/web/components/resolution/StepThrough.tsx` — existing motion pattern, D-03's reuse target
- `apps/web/components/match/MatchChat.tsx` — corner-dock template for the new Intel drawer
- `apps/web/lib/uiStore.ts`, `apps/web/lib/matchStore.ts`, `apps/web/lib/socket.ts` — existing state/wire plumbing that the new history field rides through unmodified
- `apps/web/app/match/[code]/page.tsx` — current `StepThrough` call site and round-number derivation pattern to reuse
- `packages/engine/tests/helpers.ts` — `fingerprint()`, confirms golden fixtures are unaffected (Pitfall 4)
- `packages/engine/tests/golden.test.ts`, `packages/engine/tests/fog-leak.test.ts`, `apps/party/tests/fog-wire.test.ts` — existing test patterns to extend
- `apps/web/package.json` — confirms `motion@13.1.0` dependency
- `docs/ARCHITECTURE.md` §4.1–4.2 — fog boundary and symmetric Burn Track design intent
- `docs/GAME_DESIGN.md` §6.3 — Burn Track design intent ("capability profile," own-track visibility)

### Secondary (MEDIUM confidence)
- `npm view motion version` — confirms 13.2.0 is current upstream; not independently cross-checked against a changelog

### Tertiary (LOW confidence)
- None — every claim above traces to a file read this session or a direct tool check

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing dependency versions confirmed by direct file read and registry check
- Architecture (history persistence pattern): HIGH — derived from reading the actual `filterEvents()`/`strikeNoise.ts` implementation, not assumed from documentation
- Pitfalls: HIGH — Pitfall 1/2 are traced to exact line-level source reads, not inferred
- Burn Track (D-04 verification): HIGH — confirmed end-to-end wiring by reading all four files CONTEXT.md named
- UI component patterns: HIGH — `StepThrough.tsx`, `MatchChat.tsx` read in full

**Research date:** 2026-09-02
**Valid until:** 30 days (stable internal codebase; no external API drift risk since no new third-party dependencies are introduced)

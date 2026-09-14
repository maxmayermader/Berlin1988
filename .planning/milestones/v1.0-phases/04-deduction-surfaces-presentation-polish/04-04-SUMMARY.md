---
phase: 04-deduction-surfaces-presentation-polish
plan: 04
subsystem: ui
tags: [motion, react, nextjs, tailwind, accessibility, reduced-motion]

# Dependency graph
requires:
  - phase: 04-deduction-surfaces-presentation-polish
    provides: "apps/web/lib/motion.ts (DURATION, EASING, fadeSlideUpVariant, cardFlipVariant, HOVER_TRANSITION_CLASS) from Plan 04-01, plus the Intel surfaces (RoundHistoryPanel, BurnTrackPanel, MatchIntelDrawer) from Plans 04-01 through 04-03 that this plan's motion pass folds into the same single reduced-motion code path"
provides:
  - "PageTransition client wrapper giving all four route roots a fadeSlideUp mount entry while the home route stays a React Server Component"
  - "Button.tsx enabled-only hover fills (#1d4ed8 primary, #b91c1c destructive) via the shared HOVER_TRANSITION_CLASS"
  - "StepThrough.tsx refactored onto fadeSlideUpVariant — the app's original inline reduced-motion ternary is gone"
  - "MatchChat and MatchIntelDrawer toggle buttons animated/hover-consistent; CardGrid tiles flip via cardFlipVariant"
  - "apps/web/lib/motionPass.test.ts — a cross-file regression net asserting exactly one reduced-motion code path exists in the app"
  - "Human-verified: full app motion pass with OS reduced-motion preference both off and on, plus the two backstop UI checks (reconnect-mid-match, history-survives-refresh)"
affects: [ui-polish, accessibility, deck, match, lobby]

# Actuals (#2632)
actuals:
  tokens: 6414
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single reduced-motion code path: every component calling useReducedMotion imports from apps/web/lib/motion.ts rather than expressing its own ternary; enforced by a cross-file loop in motionPass.test.ts"
    - "RSC-preserving client wrapper: PageTransition takes server-rendered children as a prop rather than the route itself becoming a client component"
    - "enabled: hover gating — hover fills use the enabled: Tailwind variant so disabled/pending controls never look actionable"

key-files:
  created:
    - apps/web/components/ui/PageTransition.tsx
    - apps/web/lib/motionPass.test.ts
  modified:
    - apps/web/components/ui/Button.tsx
    - apps/web/app/page.tsx
    - apps/web/app/deck/page.tsx
    - "apps/web/app/lobby/[code]/page.tsx"
    - "apps/web/app/match/[code]/page.tsx"
    - apps/web/components/resolution/StepThrough.tsx
    - apps/web/components/match/MatchChat.tsx
    - apps/web/components/match/MatchIntelDrawer.tsx
    - apps/web/components/deck/CardGrid.tsx

key-decisions:
  - "Task 3's checkpoint:human-verify (gate=\"blocking\") was answered by the user with a plain 'approved' after reviewing Parts A, B, and C of the manual sweep — no numbered step was flagged as failing, so no follow-up fix task was needed."
  - "PageTransition wraps only the match route's live-play return, leaving its three early-return branches (connection lost, no view yet, result screen) as plain <main> per the plan's explicit instruction not to animate terminal/loading states."
  - "useReducedMotion is called once in CardGrid and passed down to CardTile as a prop, not called per-tile, to avoid 34 redundant hook calls per render."

requirements-completed: [POLISH-01]

coverage:
  - id: D1
    description: "All four route roots (home, deck, lobby, match) fade in on mount via PageTransition; the home route remains a React Server Component"
    requirement: "POLISH-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/motionPass.test.ts — PageTransition/route-file assertions"
        status: pass
      - kind: unit
        ref: "pnpm --filter web build — confirms / is still statically prerendered (RSC boundary intact)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Button primary/destructive variants darken smoothly on hover (#1d4ed8 / #b91c1c), gated to enabled controls only; pending/disabled treatment unchanged"
    requirement: "POLISH-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/motionPass.test.ts — Button.tsx source assertions"
        status: pass
    human_judgment: false
  - id: D3
    description: "StepThrough refactored onto the shared fadeSlideUpVariant utility with no observable behaviour change"
    requirement: "POLISH-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/stepThrough.test.ts (unmodified, zero diff)"
        status: pass
      - kind: unit
        ref: "apps/web/lib/motionPass.test.ts — no inline ternary / no bare duration literal assertions"
        status: pass
    human_judgment: false
  - id: D4
    description: "MatchChat animates (deferral comment removed), MatchIntelDrawer and MatchChat toggle buttons share hover treatment, CardGrid tiles flip on select/deselect"
    requirement: "POLISH-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/motionPass.test.ts — MatchChat/CardGrid/MatchIntelDrawer assertions"
        status: pass
    human_judgment: false
  - id: D5
    description: "Exactly one reduced-motion code path exists across the seven animated components; a future component that reimplements the branch fails the suite"
    requirement: "POLISH-01"
    verification:
      - kind: unit
        ref: "apps/web/lib/motionPass.test.ts — cross-file loop over the seven-component array"
        status: pass
    human_judgment: false
  - id: D6
    description: "End-to-end human sweep: normal motion (Part A), reduced motion (Part B), and the two backstop checks — no loading skeleton on reconnect, history survives refresh (Part C)"
    verification:
      - kind: manual_procedural
        ref: "Task 3 checkpoint:human-verify — 19-step how-to-verify, user responded 'approved'"
        status: pass
    human_judgment: true
    rationale: "prefers-reduced-motion is a browser media query with no server or test-harness surface; visual smoothness, panel positioning, and focus-ring visibility require a human eye. The plan explicitly held this out as a checkpoint rather than an automated check."

# Metrics
duration: 18min
completed: 2026-09-03
status: complete
---

# Phase 04 Plan 04: App-Wide Motion Pass Summary

**Every route now fades in on mount, both Button variants darken on hover, StepThrough runs on the shared motion utility instead of its own inline branch, and MatchChat/CardGrid/MatchIntelDrawer are folded into the same one reduced-motion code path — verified end to end by the user with the OS reduced-motion preference both off and on.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-03T23:27:18Z (first commit, bff3651)
- **Completed:** 2026-09-03T23:45:00Z (approx, checkpoint approval + summary write)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 11 (2 created, 9 modified)

## Accomplishments
- `PageTransition.tsx` — a client wrapper giving any route root a `fadeSlideUp` mount entry without forcing the route itself to become a client component; wired onto all four route roots (home, deck, lobby, match), with the home route confirmed still statically prerendered by `pnpm --filter web build`.
- `Button.tsx` gained enabled-only hover fills (`#1d4ed8` primary, `#b91c1c` destructive) via the shared `HOVER_TRANSITION_CLASS`, leaving the existing `pending`/`disabled:opacity-50` treatment untouched.
- `StepThrough.tsx` — the file the shared motion utility was originally extracted from — refactored onto `fadeSlideUpVariant(reducedMotion)`, removing the app's last inline `reducedMotion ? false` ternary and bare `duration: 0.25` literal, with zero observable behaviour change (`stepThrough.test.ts` unmodified and green).
- `MatchChat.tsx` finally animates (closing a deferral its own source comment carried since Phase 3) and, along with `MatchIntelDrawer.tsx`, gained a consistent hover treatment on its collapsed toggle button.
- `CardGrid.tsx`'s `CardTile` now flips via `cardFlipVariant` on `inLoadout` change instead of an instant colour swap, with `useReducedMotion` read once by the parent grid rather than per-tile.
- `apps/web/lib/motionPass.test.ts` — a new cross-file regression net (21 tests) asserting every component that calls `useReducedMotion` imports from the shared `apps/web/lib/motion.ts` module, and that the inline ternary form appears zero times across the app's seven animated components.
- Task 3's full manual sweep (normal motion, reduced motion, and the two backstop checks) was reviewed and approved by the user with no failing step reported.

## Task Commits

Each task was committed atomically:

1. **Task 1: Every route arrives, every button answers — page-mount entry and hover fills** - `bff3651` (test, RED) → `f96e3ad` (feat, GREEN)
2. **Task 2: One reduced-motion code path — StepThrough refactor, MatchChat/CardGrid animated** - `ef480c5` (test, RED) → `dcbdb4c` (refactor, GREEN)
3. **Task 3: Reduced-motion sweep and the phase's held-out visual checks** - `checkpoint:human-verify`, gate="blocking" — user responded "approved" (no commit; verification-only checkpoint)

_Note: both auto tasks followed the RED → GREEN TDD cycle: a failing `motionPass.test.ts` extension committed first, then the implementation that turns it green._

## Files Created/Modified
- `apps/web/components/ui/PageTransition.tsx` - New client wrapper: `useReducedMotion()` once, spreads `fadeSlideUpVariant(reducedMotion)` onto a `motion.div`/`motion.main`, taking server-rendered `children` as a prop
- `apps/web/lib/motionPass.test.ts` - New cross-file test asserting adoption of the shared motion utility everywhere it should be used, and its absence as a second code path
- `apps/web/components/ui/Button.tsx` - Imports `HOVER_TRANSITION_CLASS`; primary/destructive variants gain `enabled:hover:bg-[#1d4ed8]` / `enabled:hover:bg-[#b91c1c]`
- `apps/web/app/page.tsx`, `apps/web/app/deck/page.tsx`, `apps/web/app/lobby/[code]/page.tsx`, `apps/web/app/match/[code]/page.tsx` - Root `<main>` wrapped in `PageTransition`; home route retains no client directive
- `apps/web/components/resolution/StepThrough.tsx` - Inline reduced-motion ternary and duration literal replaced with `fadeSlideUpVariant(reducedMotion)`; `useReducedMotion()` call site unchanged
- `apps/web/components/match/MatchChat.tsx` - Expanded panel now a `motion.div` spreading the shared variant; deferral comment removed; toggle button gains hover treatment
- `apps/web/components/match/MatchIntelDrawer.tsx` - Collapsed toggle button gains the same hover treatment as MatchChat's
- `apps/web/components/deck/CardGrid.tsx` - `CardTile` becomes a `motion.div` spreading `cardFlipVariant(reducedMotion)`, keyed on `inLoadout`; `useReducedMotion()` hoisted to the grid level

## Decisions Made
- Task 3's checkpoint was answered by the user with a bare "approved," confirming Parts A (normal motion), B (reduced motion), and C (the two backstop checks: no loading flash on mid-match reconnect, history surviving refresh) all passed exactly as specified — no numbered step was flagged as failing, so no follow-up fix task was required.
- `PageTransition` wraps only the match route's live-play return; its three early-return branches (connection lost, no view yet, result screen) keep a plain `<main>` per the plan's explicit instruction, preserving the `if (!view)` guard as a cheap synchronous return and leaving `MatchChat`/`MatchIntelDrawer` mount positions undisturbed (both `matchChatMount.test.ts` and `intelDrawer.test.ts` stayed green throughout).
- `useReducedMotion()` is called once in `CardGrid` and threaded down to `CardTile` as a prop rather than called inside `CardTile` itself, avoiding 34 redundant hook calls per render.

## Deviations from Plan

None - plan executed exactly as written. Both auto tasks' acceptance criteria were met without needing any Rule 1-4 auto-fix; the checkpoint was approved as-is.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 04 (deduction-surfaces-presentation-polish) is now fully complete: persisted round history (04-01), headlines and expand-to-replay (04-02), the Burn Track tab (04-03), and this plan's app-wide motion pass (04-04) are all committed and green. `apps/web/lib/motion.ts` is confirmed as the app's single reduced-motion code path, pinned by `apps/web/lib/motionPass.test.ts`'s cross-file loop, and both of `04-UI-SPEC.md`'s backstop UI Considerations rows (no loading skeleton on reconnect; history survives refresh) are now closed by Task 3's human sweep. No blockers for the next phase.

---
*Phase: 04-deduction-surfaces-presentation-polish*
*Completed: 2026-09-03*
